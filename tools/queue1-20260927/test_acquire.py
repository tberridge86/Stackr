import io, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import acquire as a
from PIL import Image

class AcquisitionTests(unittest.TestCase):
    def setUp(self):
        self.cfg=a.load_manifest()['swsh4.5sv']
        self.row=a.target_row(self.cfg,['SV001','Rowlet','holo','holo'])
        self.card={'id':'swsh45sv-SV001','number':'SV001','name':'Rowlet','images':{'large':'https://images.pokemontcg.io/swsh45sv/SV001_hires.png'}}
    def data(self,card=None):return {'tcgdex':[],'fallback':{'records':[card or self.card],'url':'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/cards/en/swsh45sv.json','sha256':'fixture'},'errors':[]}
    def test_manifest(self):self.assertEqual(sum(c['expected_count'] for c in a.load_manifest().values()),348)
    def test_exact_scope(self):self.assertEqual(sum(a.COUNTS[c] for c in a.LANE),348);self.assertNotIn('B2a',a.LANE)
    def test_suffix_typography(self):self.assertEqual(a.name_key('Entei-GX'),a.name_key('Entei GX'))
    def test_not_fuzzy(self):self.assertNotEqual(a.name_key('Rowlet'),a.name_key('Dartrix'))
    def test_exact_match(self):self.assertEqual(a.resolve(self.row,self.cfg,self.data())['status'],'source_matched')
    def test_preserve_prefix(self):self.assertEqual(a.resolve(self.row,self.cfg,self.data(dict(self.card,id='swsh45sv-001',number='001')))['status'],'hold_no_exact_image_source')
    def test_wrong_name(self):self.assertEqual(a.resolve(self.row,self.cfg,self.data(dict(self.card,name='Dartrix')))['status'],'hold_source_conflict')
    def test_duplicate(self):
        data=self.data();data['fallback']['records']*=2
        self.assertEqual(a.resolve(self.row,self.cfg,data)['status'],'hold_source_conflict')
    def test_bad_host(self):
        with self.assertRaises(ValueError):a.validate_url('https://images.pokemontcg.io.evil.test/a',a.IMAGE_HOSTS)
    def test_userinfo(self):
        with self.assertRaises(ValueError):a.validate_url('https://secret@images.pokemontcg.io/a',a.IMAGE_HOSTS)
    def test_localhost(self):
        with self.assertRaises(ValueError):a.validate_url('http://127.0.0.1/a',a.IMAGE_HOSTS)
    def test_foreign_tcgdex_image(self):
        d=self.data();d['tcgdex']=[dict(set_id='swsh4.5sv',url='test',sha256='test',records=[dict(id='swsh4.5sv-SV001',localId='SV001',name='Rowlet',image='https://assets.tcgdex.net/ja/swsh/x/SV001')])]
        self.assertEqual(a.resolve(self.row,self.cfg,d)['status'],'hold_source_conflict')
    def test_tcgdex_priority(self):
        d=self.data();d['tcgdex']=[dict(set_id='swsh4.5sv',url='test',sha256='test',records=[dict(id='swsh4.5sv-SV001',localId='SV001',name='Rowlet',image='https://assets.tcgdex.net/en/swsh/x/SV001')])]
        self.assertEqual(a.resolve(self.row,self.cfg,d)['candidates'][0]['provider'],'tcgdex')
    def test_nonimage(self):
        with self.assertRaises(ValueError):a.inspect_image(b'<html/>','text/html')
    def test_small_image(self):
        f=io.BytesIO();Image.new('RGB',(50,70)).save(f,format='PNG')
        with self.assertRaises(ValueError):a.inspect_image(f.getvalue(),'image/png')
    def test_decode_download_receipt(self):
        f=io.BytesIO();Image.new('RGB',(600,825)).save(f,format='PNG');raw=f.getvalue()
        r=a.resolve(self.row,self.cfg,self.data())
        with tempfile.TemporaryDirectory() as p,patch.object(a,'get',return_value=(raw,'image/png',self.card['images']['large'])):
            out=a.acquire(r,Path(p));self.assertEqual(out['status'],'downloaded_review_only')
            self.assertTrue(out['image_decoded']);self.assertFalse(out['publication_eligible']);self.assertFalse(out['staged'])
    def test_failure_visible(self):
        r=a.resolve(self.row,self.cfg,self.data())
        with tempfile.TemporaryDirectory() as p,patch.object(a,'get',side_effect=ValueError('fixture unavailable')):
            self.assertEqual(a.acquire(r,Path(p))['status'],'hold_image_fetch_or_decode')
    def test_duplicate_hash_hold(self):
        rows=[dict(self.row,status='downloaded_review_only',image_sha256='same'),dict(self.row,collector_number='SV002',status='downloaded_review_only',image_sha256='same')]
        with tempfile.TemporaryDirectory() as p:a.save(Path(p),rows)
        self.assertTrue(all(r['status']=='hold_identical_image_bytes' for r in rows))
if __name__=='__main__':unittest.main()
