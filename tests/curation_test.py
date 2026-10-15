import importlib.util,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('curation',Path(__file__).resolve().parent.parent/'research/curation-pipeline.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
def record(vid='abcdefghijk',brand='Blacksmith',end=50):return dict(videoId=vid,transcriptUrl='https://example.com/captions',segments=[dict(start=0,end=4,text='A word from our sponsor.'),dict(start=5,end=24,text='Have you spent all day coding only to wait for CI? It fails and logs tell you nothing.'),dict(start=end,end=end+5,text=f'Try {brand} today.')])
class Curation(unittest.TestCase):
 def test_long_cue_is_review_only(self):
  r=m.triage([record()]);self.assertEqual(r['newLongGapCount'],1);self.assertEqual(r['approvedCount'],0);self.assertFalse(r['candidates'][0]['enabled']);self.assertEqual(r['candidates'][0]['clueDurations'],[5,10,15,20])
 def test_short_rejected_without_interpolation(self):self.assertFalse(m.triage([record(end=25)])['candidates'][0]['captionGapEligible'])
 def test_mixed_brand_samecue_not_eligible(self):
  r=record();r['segments'][0]['text']='Our sponsor Blacksmith helps.';self.assertFalse(m.triage([r])['candidates'][0]['captionGapEligible'])
 def test_existing_video_not_new(self):self.assertEqual(m.triage([record()],['abcdefghijk'])['newLongGapCount'],0)
 def test_duplicate_story_flagged_not_deleted(self):
  r=m.triage([record(),record('12345678901')]);self.assertEqual(r['candidateCount'],2);self.assertEqual(r['candidates'][0]['nearestScripts'][0]['similarity'],1)
 def test_samebrand_distinct_story(self):
  b=record('12345678901');b['segments'][1]['text']='You have a container cache and different machines with missing layers.';r=m.triage([record(),b]);self.assertEqual(r['candidateCount'],2);self.assertLess(r['candidates'][0]['nearestScripts'][0]['similarity'],.3)
 def test_bad_cues_return_errors(self):
  a=record();a['segments'][1]['start']=float('nan');self.assertEqual(len(m.triage([a])['errors']),1)
 def test_first_brand_cue_is_lower_bound(self):self.assertEqual(m.triage([record()])['candidates'][0]['safeEnd'],48)
if __name__=='__main__':unittest.main()
