import importlib,unittest
verify=importlib.import_module('acquire-tw').verify_page
ROW={'language_code':'zh-tw','permission_status':'REVIEW_REQUIRED','identity_url':'https://asia.pokemon-card.com/tw/card-search/detail/6387/','image_url':'https://asia.pokemon-card.com/tw/card-img/tw00006387.png','card_native_name':'鬼斯','source_name':'鬼斯','source_set':'S10a','set_code':'S10a','collector_number':'021','source_number':'021','source_total':'071','printed_total':71}
HTML='''<title>鬼斯 | 訓練家網站</title><h1 class="cardDetail"><span class="evolveMarker">基礎</span>鬼斯</h1><div class="cardImage"><img src="https://asia.pokemon-card.com/tw/card-img/tw00006387.png"></div><span class="expansionSymbol"><img src="https://asia.pokemon-card.com/tw/card-img/mark/S10a_F@4x.png"></span><span class="collectorNumber">021/071</span><section class="expansionLinkColumn"><a href="/tw/card-search/list/?expansionCodes=S10a">黑暗亡靈</a></section>'''
class TaiwanIdentity(unittest.TestCase):
 def test_unnumbered_energy_exact_native_page_code(self):
  row={**ROW,'collector_number':'DAR','source_number':'DAR','source_total':-1}
  self.assertIsNone(verify(HTML.replace('021/071','DAR').encode(),row)['verified_total'])
  with self.assertRaisesRegex(ValueError,'number'):verify(HTML.replace('021/071','GRS').encode(),row)
 def test_promo_series_is_denominator(self):
  row={**ROW,'source_set':'SV-P','set_code':'SV-P','source_total':'SV-P','printed_total':0}
  html=HTML.replace('S10a_F@4x.png','PROMO.MARK.png').replace('expansionCodes=S10a','expansionCodes=SV-P').replace('021/071','021/SV-P')
  self.assertEqual(verify(html.encode(),row)['verified_total'],'SV-P')
  with self.assertRaisesRegex(ValueError,'series'):verify(html.replace('021/SV-P','021/S-P').encode(),row)
 def test_official_symbol_filename_formats(self):
  for symbol in ['s10aF_enp.png','S10aF @4x.png','S10a F@4x.png','S_mark_expantion_S10a_F_OL.png']:
   self.assertEqual(verify(HTML.replace('S10a_F@4x.png',symbol).encode(),ROW)['verified_set'],'S10a')
 def test_symbol_other_set_rejected(self):
  for symbol in ['S10b_F@4x.png','S10ab_F@4x.png','S_mark_expantion_S10b_F_OL.png']:
   with self.assertRaisesRegex(ValueError,'mark'):verify(HTML.replace('S10a_F@4x.png',symbol).encode(),ROW)
 def test_exact_identity(self):self.assertEqual(verify(HTML.encode(),ROW)['verified_number'],'021')
 def test_name_conflict(self):
  with self.assertRaisesRegex(ValueError,'name'):verify(HTML.replace('鬼斯','鬼斯通').encode(),ROW)
 def test_number_conflict(self):
  with self.assertRaisesRegex(ValueError,'number'):verify(HTML.replace('021/071','022/071').encode(),ROW)
 def test_denominator_conflict(self):
  with self.assertRaisesRegex(ValueError,'denominator'):verify(HTML.replace('021/071','021/072').encode(),ROW)
 def test_expansion_conflict(self):
  with self.assertRaisesRegex(ValueError,'expansion'):verify(HTML.replace('expansionCodes=S10a','expansionCodes=S10b').encode(),ROW)
 def test_image_substitution(self):
  with self.assertRaisesRegex(ValueError,'URL'):verify(HTML.replace('tw00006387.png','tw00006388.png').encode(),ROW)
 def test_wrong_language_scope(self):
  with self.assertRaisesRegex(ValueError,'scope'):verify(HTML.encode(),{**ROW,'language_code':'zh-cn'})
 def test_wrong_native_source(self):
  with self.assertRaisesRegex(ValueError,'native-language'):verify(HTML.encode(),{**ROW,'identity_url':ROW['identity_url'].replace('/tw/','/hk/')})
