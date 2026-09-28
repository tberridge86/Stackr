import unittest
from acquire import verify_page,numeric_equal
from scan import safe
class IdentityTests(unittest.TestCase):
    def setUp(self):
        self.row={'source_name':'ミミッキュVMAX','source_set':'S8b','source_number':'077','source_total':'184','image_url':'https://www.pokemon-card.com/assets/card.jpg'}
        self.html='<h1 class="Heading1 mt20">ミミッキュVMAX</h1><img class="fit" src="/assets/card.jpg"><div class="subtext"><img class="img-regulation" alt="S8b">077&nbsp;/&nbsp;184</div>'.encode()
    def test_exact_live_identity(self):self.assertEqual(verify_page(self.html,self.row)['verified_number'],'077')
    def test_wrong_set_rejected(self):
        with self.assertRaises(ValueError):verify_page(self.html.replace(b'S8b',b'S8a'),self.row)
    def test_wrong_number_rejected(self):
        with self.assertRaises(ValueError):verify_page(self.html.replace(b'077',b'078'),self.row)
    def test_wrong_art_url_rejected(self):
        with self.assertRaises(ValueError):verify_page(self.html.replace(b'card.jpg',b'other.jpg'),self.row)
    def test_zero_padding(self):self.assertTrue(numeric_equal('086',86));self.assertFalse(numeric_equal('86',85));self.assertFalse(numeric_equal('TG01','1'))
    def test_language_host_cannot_redirect(self):
        with self.assertRaises(ValueError):safe('https://asia.pokemon-card.com/tw/card.png',{'www.pokemon-card.com'})
    def test_prism_symbol_required(self):
        row={**self.row,'source_name':self.row['source_name']+'prismstar','name_match_rule':'prism_symbol_spelling'}
        with self.assertRaises(ValueError):verify_page(self.html,row)
        html=self.html.replace(b'</h1>',b'<span class="pcg pcg-prismstar"></span></h1>')
        self.assertEqual(verify_page(html,row)['verified_symbols'],['prismstar'])
    def test_unreviewed_qualifier_rejected(self):
        row={**self.row,'source_name':self.row['source_name']+'(someone)','name_match_rule':'reviewed_character_qualifier','set_code':'S8b','collector_number':'077'}
        with self.assertRaises(ValueError):verify_page(self.html,row)
if __name__=='__main__':unittest.main()
