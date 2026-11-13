/** 학습용 PDF와 개념 시험의 공통 본문. 표시 방식 외 원문과 순서는 동일하다. */
const GrammarPaper = {
  escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  },
  studyText(text) {
    return this.escape(String(text || '').replace(/\{\{(.*?)\}\}/g, '$1'));
  },
  render(content, renderText) {
    const escape = value => this.escape(value);
    return `<h1>${escape(content.title)}</h1>
      <div class="grammar-definition"><strong>${escape(content.definitionHeading || '#가정법')}</strong><p>${renderText(content.definition, 'definition')}</p></div>
      <h2>${escape(content.sectionsHeading || '#가정법의 종류')}</h2>
      ${content.sections.map((section, i) => `<section class="grammar-section"><h3>${escape(section.title)}</h3><p class="grammar-muted">${renderText(section.description, `s${i}_description`)}</p>${section.formula ? `<p>${renderText(section.formula, `s${i}_formula`)}</p>` : ''}<p class="grammar-example">${renderText(section.example, `s${i}_example`)}</p><p class="grammar-muted">${escape(section.translation)}</p></section>`).join('')}
      <section class="grammar-section"><h3>${escape(content.expressionsHeading || '④ 기타 필수 가정법 표현')}</h3><div class="overflow-x-auto"><table class="grammar-table"><tbody>${content.expressions.map((row, i) => `<tr>${i === 0 || row.group !== content.expressions[i - 1].group ? `<th scope="rowgroup" rowspan="${content.expressions.filter(r => r.group === row.group).length}">${escape(row.group)}</th>` : ''}<td>${renderText(row.formula, `e${i}_formula`)}</td><td>${renderText(row.example, `e${i}_example`)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
};
