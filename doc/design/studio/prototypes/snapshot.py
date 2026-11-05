"""Regenerate the bounded real Git fixture from an explicit repository/revision.
Usage: python snapshot.py /path/to/git/repository 8bb1802
Git IDs are displayed as Git IDs, never fabricated jj change IDs.
"""
import json, subprocess, sys
from pathlib import Path
repo, revision = sys.argv[1:]
def git(*args):
    return subprocess.check_output(['git', '-C', repo, *args], text=True)
rows=[]
for line in git('log','-18','--format=%h\t%s',revision).splitlines():
    identity,title=line.split('\t',1)
    files=git('diff-tree','--no-commit-id','--name-only','-r',identity).splitlines()[:8]
    rows.append(dict(id=identity,title=title,files=files,diffs={path:git('show',identity,'--',path)[:9000] for path in files}))
Path(__file__).with_name('snapshot.js').write_text('window.REVISIONS='+json.dumps(rows)+';\n')
