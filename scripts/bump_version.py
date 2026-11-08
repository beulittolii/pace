#!/usr/bin/env python3
"""Increment the footer patch version once per commit, based on HEAD."""
import re
import subprocess
from pathlib import Path


def git(*args):
    return subprocess.check_output(['git', *args], text=True)


pattern = re.compile(r'(<footer\b[^>]*>[\s\S]*?<p>)v(\d+)\.(\d+)\.(\d+)(</p>)')
staged = git('show', ':index.html')
previous = git('show', 'HEAD:index.html')
match = pattern.search(previous)
staged_match = pattern.search(staged)
if not match or not staged_match:
    raise SystemExit('Footer version missing; commit cancelled.')
previous_version = tuple(int(match[i]) for i in (2, 3, 4))
staged_version = tuple(int(staged_match[i]) for i in (2, 3, 4))
# Preserve an explicit release bump instead of replacing it with a patch bump.
next_version = staged_version if staged_version > previous_version else (*previous_version[:2], previous_version[2] + 1)
version = '.'.join(map(str, next_version))
updated = pattern.sub(lambda m: f'{m[1]}v{version}{m[5]}', staged, count=1)
if staged != updated:
    # Preserve partial staging: stop rather than stage unrelated HTML changes.
    if git('diff', '--', 'index.html'):
        raise SystemExit('Stage or stash index.html changes before committing so the version can be updated safely.')
    Path('index.html').write_text(updated)
    subprocess.run(['git', 'add', '--', 'index.html'], check=True)
print(f'Footer version: v{version}')
