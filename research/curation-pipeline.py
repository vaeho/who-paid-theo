"""Metadata-only batch triage. Never fetches or extracts audiovisual media.
Input: list of {videoId,title,publishedDate,sourceUrl,transcriptUrl,segments:[{start,end,text}]}.
Only review leads are emitted; approval remains a separate visual/start audit.
"""
import argparse, hashlib, json, math, re
from pathlib import Path
BRANDS=['WorkOS','Arcjet','Clerk','Convex','Blacksmith','Greptile','Daytona','G2i','Infinite Red','Sevalla','Sentry','Depot','Browserbase','CodeRabbit','Parallel','Qdrant','Macroscope','Mux','DNSimple','Firecrawl','PostHog','Railway','Doppler','Axiom','Upstash','Turso','PlanetScale','Neon','Supabase','Better Stack','Highlight','Warp','Raycast','Temporal','SingleStore','Xata','Tinybird','Clerk','Resend','UploadThing']
def words(text):return re.findall(r'[a-z0-9]+',text.lower())
def shingles(text):
 w=words(text);return {' '.join(w[i:i+4]) for i in range(max(0,len(w)-3))}
def similarity(a,b):return len(a&b)/len(a|b) if a|b else 0
PATTERNS={b:re.compile(r'\b'+re.escape(b).replace(r'\ ',r'\s*')+r'\b',re.I) for b in set(BRANDS)}
def validate(record):
 if not re.fullmatch(r'[A-Za-z0-9_-]{11}',record.get('videoId','')):raise ValueError('Invalid videoId')
 if not record.get('transcriptUrl','').startswith('https://'):raise ValueError('Missing HTTPS caption source')
 previous=-1
 for s in record.get('segments',[]):
  if not all(isinstance(s.get(k),(int,float)) and math.isfinite(s[k]) for k in ['start','end']):raise ValueError('Non-finite cue')
  if s['start']<previous or s['end']<s['start'] or not isinstance(s.get('text'),str):raise ValueError('Invalid cue order/range/text')
  previous=s['start']
 if not record.get('segments'):raise ValueError('No caption cues')
def triage(records,known=()):
 leads=[];errors=[];signatures={};known=set(known)
 for r in records:
  try:validate(r)
  except ValueError as e:errors.append({'videoId':r.get('videoId'),'error':str(e)});continue
  ps=r['segments']
  for i,p in enumerate(ps):
   if not re.search(r'\bsponsor(?:ed)?\b',p['text'],re.I):continue
   # One lead per transition, not every brand mention in the same ad.
   if i and re.search(r'\bsponsor(?:ed)?\b',ps[i-1]['text'],re.I) and p['start']-ps[i-1]['start']<45:continue
   brand=None;j=None
   for n in range(i,min(i+24,len(ps))):
    if ps[n]['start']-p['start']>240:break
    hits=[(m.start(),b) for b,pat in PATTERNS.items() if (m:=pat.search(ps[n]['text']))]
    if hits:brand=min(hits)[1];j=n;break
   if brand is None:continue
   # A transition may contain the actual opener: retain separately, never assume it starts at next cue.
   anchor=ps[i+1]['start'] if i+1<len(ps) else p['end']
   safe=ps[j]['start']-2
   candidate_key=f"{r['videoId']}:{p['start']:g}"
   setup=' '.join(x['text'] for x in ps[i+1:j])
   sig=hashlib.sha256(' '.join(words(setup)).encode()).hexdigest()[:20]
   signatures[candidate_key]=shingles(setup)
   eligible=j>i+1 and safe-anchor>=20
   leads.append(dict(candidateId=candidate_key,videoId=r['videoId'],title=r.get('title',''),publishedDate=r.get('publishedDate'),sponsor=brand,sourceUrl=r.get('sourceUrl',f"https://www.youtube.com/watch?v={r['videoId']}"),transcriptUrl=r['transcriptUrl'],transitionWindow=[p['start'],p['end']],candidateStart=anchor,firstBrandContainingCue=[ps[j]['start'],ps[j]['end']],safeEnd=safe,conservativeRoom=round(max(0,safe-anchor),3),captionGapEligible=eligible,openingCue=' '.join(words(ps[i+1]['text'])[:16]) if j>i else '',scriptSignature=sig,alreadyPlayable=r['videoId'] in known,status='pending-start-and-visual-review' if eligible else 'mixed-or-short-needs-finer-captions',clueDurations=[5,10,15,20] if eligible else [],enabled=False))
 for lead in leads:
  near=sorted([dict(candidateId=x['candidateId'],similarity=round(similarity(signatures[lead['candidateId']],signatures[x['candidateId']]),4)) for x in leads if x['candidateId']!=lead['candidateId']],key=lambda x:-x['similarity'])[:3]
  lead['nearestScripts']=near
 # Rank new long setups first; same sponsor isn't itself a duplicate.
 leads.sort(key=lambda x:(x['alreadyPlayable'],not x['captionGapEligible'],-x['conservativeRoom'],x['candidateId']))
 return dict(inputRecords=len(records),validRecords=len(records)-len(errors),distinctVideos=len({r['videoId'] for r in leads}),candidateCount=len(leads),newLongGapCount=sum(x['captionGapEligible'] and not x['alreadyPlayable'] for x in leads),approvedCount=0,errors=errors,candidates=leads)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('inputs',nargs='+',type=Path);p.add_argument('--output',required=True,type=Path);p.add_argument('--library',type=Path,default=Path('dist/rounds.json'));a=p.parse_args()
 records=[]
 for file in a.inputs:
  data=json.loads(file.read_text());records+=data if isinstance(data,list) else data['records']
 result=triage(records,[r['videoId'] for r in json.loads(a.library.read_text())]);a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ['candidates','errors']}))
if __name__=='__main__':main()
