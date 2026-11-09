#!/usr/bin/env python3
"""Build Highest data from Flow English's six publicly shared test PDFs.

Requires PyMuPDF (pip install pymupdf). Pass the three 1-Day PDFs followed
by the three 2-Day PDFs from https://flowedu.tistory.com/506.
Only vocabulary/meanings are imported, not examples or test layouts.
The checked-in JS book-order table is retained: randomized tests cannot
recover textbook order. Never regenerate that table from test numbering.
"""
import argparse
import json
import re
from pathlib import Path

import pymupdf


def lines(page, rect):
    return [line.strip() for line in page.get_text(clip=rect).splitlines() if line.strip()]


def extract(pdf):
    for page in pymupdf.open(pdf):
        text = page.get_text()
        scope = re.search(r'Day (\d+)~(\d+)', text)
        if not scope:
            continue
        entries = []
        numbers = [w for w in page.get_text('words') if w[0] < 60 and w[1] > 150 and w[4].isdigit()]
        for number in numbers:
            y = (number[1] + number[3]) / 2
            # Each row is at least 29pt high, including the 20-row pages.
            en = ' '.join(lines(page, pymupdf.Rect(60, y - 14, 155, y + 14)))
            ko = lines(page, pymupdf.Rect(155, y - 14, 300, y + 14))
            # Question pages have an empty meaning column on the left.
            if not ko:
                continue
            assert re.fullmatch(r"[A-Za-z][A-Za-z ~'\-().]*", en), en
            assert any(re.search(r'[가-힣]', line) for line in ko), ko
            entries.append((en, ko, True))
            right_ko = lines(page, pymupdf.Rect(320, y - 17, 420, y + 17))
            right_en = ' '.join(lines(page, pymupdf.Rect(420, y - 14, 555, y + 14)))
            assert re.fullmatch(r"[A-Za-z][A-Za-z ~'\-().]*", right_en), right_en
            assert right_ko, right_en
            entries.append((right_en, right_ko, False))
        if entries:
            yield (int(scope[1]), int(scope[2])), entries


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdfs', nargs=6, type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parent.parent / 'wordmaster_highest_data.js')
    args = parser.parse_args()
    days = {}
    meanings = {}
    for index, pdf in enumerate(args.pdfs):
        seen = {}
        for (start, end), entries in extract(pdf):
            for en, ko, left in entries:
                if index < 3:
                    assert start == end
                    seen.setdefault(start, set()).add(en)
                # Wide, single-line answer cells avoid artificial Korean word breaks.
                rank = (len(ko) == 1, left)
                if en not in meanings or rank > meanings[en][0]:
                    meanings[en] = (rank, ko)
        if index < 3:
            assert set(seen) == set(range(1, 51)), (pdf, len(seen))
            assert all(len(words) == 30 for words in seen.values()), pdf
            if days:
                assert days == seen, f'Day membership differs: {pdf}'
            days = seen
    # These nine entries wrap in every version; join them at the actual word boundary.
    unwrapped = {
        'joint': '공동의, 합동의; 관절, 연결 부위',
        'consolidate': '합병하다; 굳건히 하다, 강화하다',
        'rigid': '엄격한, 융통성 없는; 굳은, 경직된, 딱딱한',
        'fuss': '호들갑, 야단, 소동; 법석을 떨다',
        'yield': '내다, 산출하다; 항복하다; 넘겨주다, 양보하다; 산출량',
        'inflate': '부풀다, 부풀리다; 올리다; 과장하다',
        'staple': '주된, 주요한; 주식; 주요소, 주성분; 스테이플러로 고정하다',
        'refine': '정제하다; 개선하다, 세련되게 하다',
        'spiral': '나선형의; 나선; 소용돌이; 나선형으로 움직이다, 나선형을 그리다; 급등하다, 급증하다',
    }
    for en, ko in unwrapped.items():
        meanings[en] = ((True, True), [ko])
    wrapped = {en: ko for en, (_, ko) in meanings.items() if len(ko) != 1}
    assert not wrapped, f'No unwrapped meaning available: {wrapped}'
    sets = []
    for day, entries in sorted(days.items()):
        words = []
        for en in sorted(entries):
            ko = re.sub(r'\s+([;,])', r'\1', meanings[en][1][0])
            # Correct obvious punctuation omissions in the shared answer sheet.
            if en == 'be stricken with':
                ko = '~에 걸리다; ~에 사로잡히다'
            if en == 'provoke':
                ko = '(특정한 반응을) 유발하다'
            words.append({'en': en, 'ko': ko, 'ipa': ''})
        sets.append({'id': f'wm_highest_day_{day:02}', 'book': '워드마스터 하이스트', 'title': f'Day {day:02}', 'studentIds': [], 'words': words})
    canonical = Path(__file__).resolve().parent.parent / 'wordmaster_highest_data.js'
    header = canonical.read_text().split('const WORDMASTER_HIGHEST_SETS = ', 1)[0]
    match = re.search(r'const WORDMASTER_HIGHEST_BOOK_ORDER = (\[[\s\S]*?\n\]);', header)
    assert match, 'Missing verified textbook-order table'
    book_order = json.loads(match[1])
    assert len(book_order) == 50
    assert all(sorted(order) == list(range(30)) for order in book_order)
    suffix = '\n'.join([
        '].map((set, dayIndex) => ({',
        '  ...set,',
        '  words: WORDMASTER_HIGHEST_BOOK_ORDER[dayIndex].map(wordIndex => set.words[wordIndex])',
        '}));',
        '',
    ])
    payload = json.dumps(sets, ensure_ascii=False, indent=2)
    args.output.write_text(header + 'const WORDMASTER_HIGHEST_SETS = ' + payload[:-1] + suffix)
    print(f'Created {args.output}: {len(sets)} Days, {sum(len(s["words"]) for s in sets)} entries')


if __name__ == '__main__':
    main()
