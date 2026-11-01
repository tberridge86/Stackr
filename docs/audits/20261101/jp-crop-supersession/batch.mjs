export const PROJECT = 'oakdbbzdqwurpjnoqhmu';
export const BUCKET = 'stackr-catalogue-public';
export const REVISION = '0bf2e60222644682d600deb7cc0e94862fd2a71a';
export const SOURCE_JPEG = '078ae1be1255300fc818cf7d2a3d18dc44852e91f830f9f8b71244c7943fbfb3';
export const BATCH = [
  { code:'l1b', setId:'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27', rowId:'49c872a8-aff6-455e-9042-dad770b2bd09', name:'SoulSilver Collection',
    sha256:'7dcfb743b476c6cba7771d20a6ace737ba67201c1fa53b8b260d0079967c0383', bytes:544426,width:1000,height:472,
    gitBlob:'028900364b897eae31db8e677fedfee33fe82b67', crop:{left:190,top:600,right:660,bottom:820},
    exclusions:[{left:610,top:795,right:660,bottom:820}] },
  { code:'ll', setId:'7dbeff79-cfb7-4ac8-8a4f-d7c73a523349', rowId:'5bd25dc4-3c25-4822-ad4b-462387d1d08f', name:'Lost Link',
    sha256:'f11661657260c1c19e1da24ceeeb5ef69fd59a16f436fedfa204a473da103add', bytes:437402,width:1000,height:541,
    gitBlob:'023f82404e8fb2cd67f105a66a0199dd9db83cf4', crop:{left:800,top:600,right:1200,bottom:815}, exclusions:[] },
];
export const sourceUrl = item => `https://github.com/tberridge86/Stackr/blob/${REVISION}/assets/rev2/11-japanese-set-logo/logos/${item.code}.png`;
export const sourceIdentifier = item => `OWNER-SUPPLIED-JP-CROP-PR203:${item.code}:${item.sha256}`;
