#!/usr/bin/env python3
"""Discover and load bounded passages from the bundled AoPS study library."""
from pathlib import Path
import argparse,json,re,sys
ROOT=Path(__file__).resolve().parents[1]
CAT=json.loads((ROOT/'references/catalog.json').read_text())
def chapter(key):
 matches=[c for c in CAT if c['id'].upper()==key.upper()]
 if not matches:raise ValueError('Unknown chapter ID. Use catalog or search; example: V2-C23.')
 return matches[0]
def clean(s):return re.sub(r'[^\w]+',' ',s.lower()).strip()
def search(query):
 terms=clean(query).split();hits=[]
 for c in CAT:
  entries=[(None,c['title']+' '+' '.join(c['subjects']))]+[(s,s['title']) for s in c['sections']]
  for sec,text in entries:
   score=sum(t in clean(text) for t in terms)
   if score and score==len(terms):hits.append({'chapter':c['id'],'title':c['title'],'section':sec['id'] if sec else None,'match':text,'path':c['path']})
 return hits
def load(c,section=None,page=None,problem=None):
 text=(ROOT/c['path']).read_text();lines=text.splitlines();start=0;end=len(lines)
 if section:
  match=next((s for s in c['sections'] if s['id']==section),None)
  if match is None:raise ValueError('Section not indexed. Load the chapter or a printed page; use the chapter or printed page.')
  start=match['line']-1;depth=len(section.split('.'))
  for s in c['sections']:
   if s['line']-1>start and len(s['id'].split('.'))<=depth:end=s['line']-1;break
 elif page is not None:
  match=next((i for i,l in enumerate(lines) if l==f'## Printed page {page}'),None)
  if match is None:raise ValueError('Printed page is outside this chapter.')
  start=match
  end=next((i for i in range(start+1,len(lines)) if lines[i].startswith('## Printed page ')),len(lines))
 elif problem is not None:
  match=next((i for i,l in enumerate(lines) if re.match(r'^\s*'+str(problem)+r'\.\s',l)),None)
  if match is None:raise ValueError('Problem number not found in this chapter.')
  start=match
  end=next((i for i in range(start+1,len(lines)) if re.match(r'^\s*\d{1,3}\.\s',lines[i]) or lines[i].startswith('### ')),len(lines))
 # Source page at the passage start and any subsequent page boundaries.
 pages=[]
 for l in lines[:start+1]:
  m=re.match(r'## Printed page (\d+)',l)
  if m:pages=[int(m[1])]
 for l in lines[start+1:end]:
  m=re.match(r'## Printed page (\d+)',l)
  if m:pages.append(int(m[1]))
 offset=c['pdf_pages'][0]-c['printed_pages'][0]
 scans=[str((ROOT/c['path']).parent.parent/'assets'/f'pdf-page-{p+offset:03}.png') for p in sorted(set(pages))]
 return '\n'.join(lines[start:end]),scans

def main():
 p=argparse.ArgumentParser(description=__doc__);sp=p.add_subparsers(dest='command',required=True)
 sp.add_parser('catalog')
 s=sp.add_parser('search');s.add_argument('query')
 l=sp.add_parser('load');l.add_argument('chapter');g=l.add_mutually_exclusive_group();g.add_argument('--section');g.add_argument('--page',type=int);g.add_argument('--problem',type=int);l.add_argument('--full',action='store_true');l.add_argument('--max-chars',type=int,default=24000)
 f=sp.add_parser('find-problem');f.add_argument('--volume',type=int,choices=[1,2],required=True);f.add_argument('--number',type=int,required=True)
 a=p.parse_args()
 if a.command=='catalog':print('\n'.join(f'{c["id"]}  {c["title"]}  ({", ".join(c["subjects"])})' for c in CAT))
 elif a.command=='search':print(json.dumps(search(a.query),ensure_ascii=False,indent=2))
 elif a.command=='find-problem':
  # Chapter lists also contain a few numbered explanatory lists; show every match.
  print(json.dumps([{'chapter':c['id'],'title':c['title'],'path':c['path']} for c in CAT if c['volume']==a.volume and a.number in c['problems']],indent=2))
 else:
  c=chapter(a.chapter);text,scans=load(c,a.section,a.page,a.problem)
  print(f'# {c["id"]}: {c["title"]}\nLibrary file: {ROOT/c["path"]}\n')
  if not a.full and len(text)>a.max_chars:
   text=text[:a.max_chars]+'\n\n[OUTPUT TRUNCATED: use --section, --page, or --full to retrieve the rest.]'
  print(text);print('\nSource scans for this passage:');print('\n'.join(scans))
if __name__=='__main__':
 try:main()
 except (ValueError,FileNotFoundError) as e:print(str(e),file=sys.stderr);sys.exit(2)
