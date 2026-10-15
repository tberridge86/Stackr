// Exact13 source contract. The accepted map is finite; no generic identity exceptions.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const expectedRows = {
  "102": {
    "printing": "321e1cd2-8677-4e61-a1d7-3a9f47bcafb0",
    "variant": "10bda5e3-e914-4519-bd6d-4ee49eae442d",
    "provider": "neo4_ja-102",
    "category": "Trainer",
    "row": "399f212f2c3e833661ebfe3f744ace6f1b46635818b690aac8454adec02401da",
    "historical": "8399d045f818d0c0f9b755b1e92f7038018d3a0478b05a397dc015cf7770743d",
    "original": "ecc92984cee59268439066aa700bfdd2642aa78500028315d666c43b92e59359",
    "metadata": "256cf26f63071c7f8bf03a659dc6364882d522415b56c5c46a608ca9fe8596ce",
    "actual": "303f1a8ab6fd6f786039b26b2ed7ad59fd9003bea1adc7d4a8d32e510d7d21e0",
    "historicalActual": "303f1a8ab6fd6f786039b26b2ed7ad59fd9003bea1adc7d4a8d32e510d7d21e0",
    "source": "0232f57bffc275a73a628bffcb9ca43e23b3cd45795f2ed742155b15021ced87",
    "identity": "f5c868658d4b3591e6840ecb9e67dbd47da29e49a2f7746f59550aed1f23bcac",
    "selection": "1dda340d89fd924d67af74e7062a29f97178a869c171707e1de374976d2d4b0e",
    "publicSelection": "23f800e8d4e4f9b18f5f73b05e19407554213d65e2567c6df39fb4f1d9b88580",
    "observations": "7b2568c383649520fa78bacbf6ffbd4c9b21c19bf570887d0883f3b5ed1dbe76",
    "publicObservations": "33a1b886aa4752fc852f7ffcb99f372eed8419169f93f720890f4bacdf43cdd6"
  },
  "103": {
    "printing": "53329b0c-0a4e-4bd8-a800-11c349d6f5d7",
    "variant": "269f8c0c-92d1-47b8-b06a-8a34a1214326",
    "provider": "neo4_ja-103",
    "category": "Trainer",
    "row": "cfb8ac9d14b993cf0099920f4fdd7a0693c57f30b7583a78758edbff59692a20",
    "historical": "e67e1c7056065354c352c2c03e877f7e3d642a7833e27c6b63d92e9d0af16f37",
    "original": "fa76f889552b3d75de4ca2ce9f44287a8164345149dc596856c6c0193f16cd23",
    "metadata": "140bff6945f39df7f448cc8425d0759b97555673d123fc3502e9566e07930db6",
    "actual": "9e06499f347e70d08a779de11c8027d3c17b0bffb57bedb01b60badcb9332902",
    "historicalActual": "9e06499f347e70d08a779de11c8027d3c17b0bffb57bedb01b60badcb9332902",
    "source": "4f2be64a44734f44028ef18dc4cde91ccc79d3ce4bfb4563bd0437aa2a1a6965",
    "identity": "d28b70ef66c83170a382ff74c82ce9f6863344138a00e5e1a4993915c45d3d44",
    "selection": "61c484d760da02a54cd0d868e0e4a5e5e315588627f8353f809c7430e18b732e",
    "publicSelection": "b9018e68ac8f3306d7cf59acddec3085ad6b0b5a8e634b132b585928e79029d0",
    "observations": "0cd41a18029ba54901bb389062fec324d47fdea77efb6d3726aac231d476c5a0",
    "publicObservations": "3d211d21fcfae364a5c9111a15c7e7f85783793a4dba9de037b9400c2a9e3e39"
  },
  "104": {
    "printing": "3d3c9971-cd1a-4dbe-a659-8e4fffd669f2",
    "variant": "70d44586-048d-41d1-a65d-a420daf26e60",
    "provider": "neo4_ja-104",
    "category": "Trainer",
    "row": "f16bf2208fecfb58a83548d0876051442ee30a5db2655dbe08c532d2721fae2b",
    "historical": "b3bec92df3a755f65ad15d36388b0a7136f2cee7d00dabebcb27872c156e3ccb",
    "original": "c449ddd89086b8690d13c0d6e0027381414751c93757c89a6e12c29f6d6d0440",
    "metadata": "cf5fb5f6f53258d19490305f9da49d7a2f55ef2bf640c5ea6918fe971c3fdfec",
    "actual": "2d3fdb0ef2826943e2293bd93e81c580e6b4404826efdaab5f62f6c3744baf1c",
    "historicalActual": "2d3fdb0ef2826943e2293bd93e81c580e6b4404826efdaab5f62f6c3744baf1c",
    "source": "ccc9649f798c1507b539b1ef69e4400ecf30e8505ab4c4346ec67f6756752d27",
    "identity": "f4ed084c787cd9f10038889ba0631e716ff7ac259c284dc06e0f63530218e63a",
    "selection": "ebe16e1930341abcab23a3c02c0ff800a89373dcb2226636927b2218b0c6874b",
    "publicSelection": "141f4957a27355c159840baf9346015ac33a6176b6cd32868d6aa57f3a460805",
    "observations": "e09d94741ec701e977ab4a6b78e4c81935d3d5b27669f3b9fd557cf7fb7f6588",
    "publicObservations": "c817b2f6561ad935444bc8c19339926e4ccb1af884ef0456abfca3b2d7f7c874"
  },
  "105": {
    "printing": "ac2058d9-5f2c-464c-83dc-86145472f4b4",
    "variant": "9241f36a-931e-4b6e-914a-db6035c09052",
    "provider": "neo4_ja-105",
    "category": "Trainer",
    "row": "e91953e03b4ce0e8a02767f400f7ab3cf01fbcb93e4509b1b40851a848dec630",
    "historical": "af33d72cf636b9e612ea2e93dcbe7d74b6b55578df21e7b6e3bd2a37c0b93571",
    "original": "142bfb42e99f36a6ee81d22e5be4c6ef3d522d286a7936b6d78b54173a82b9c5",
    "metadata": "67c8a10bd2ef6202cfbab827f85bb7e853432fffac37ef86d8d031600caf7743",
    "actual": "cf38465f2b56528596392cc90e6562da35703cb5b34a21e2c313ed5331220424",
    "historicalActual": "cf38465f2b56528596392cc90e6562da35703cb5b34a21e2c313ed5331220424",
    "source": "2dbf0499e758f1a5ccab5ccdb461fe107d6973918c39a4e84fa54d4255d37a66",
    "identity": "abb1f5f82a9c32c8c1e16adbfd33f7100c28e87ec9797f17686f98b18f2cf20d",
    "selection": "562894351474dcdbde1160171df508f8b7b8b70bdc474a7bdce99da970f367e5",
    "publicSelection": "55f6832f07d1dad1f246d304e071be43951088ac48fa8347f5b11e0416ca48ca",
    "observations": "220529bebd5caf88998ab78651322df930089ba958d8e7f866b23ce3950a8fe1",
    "publicObservations": "d24db6840776185906f35fbca9307d2a80f34cbd874b995e23ef70b3c33b88bf"
  },
  "106": {
    "printing": "643d3366-7047-459b-b7ef-0a4278785e4e",
    "variant": "5c58884b-9958-4ba1-8430-af73c0cab9f1",
    "provider": "neo4_ja-106",
    "category": "Trainer",
    "row": "022c0ae51919ba67f668e4492722af1abfe5c0495fa5158356808a59dfc64454",
    "historical": "4d71412bcc9298d4b26b9da7407ccdb0f2c9083859a7b1baf6fd394e51914136",
    "original": "5dee062f5a127cb54f2509044f913e6b65b6aec2e04fd22b40162686db90f658",
    "metadata": "f6260aeafe7a4e25ad3c49eb41f57a18440f502beae65341ded3fca11a17905c",
    "actual": "19fb10e869832e0f98153327f30daa18f874c7fa89fcd957b1438a2bddd1b993",
    "historicalActual": "19fb10e869832e0f98153327f30daa18f874c7fa89fcd957b1438a2bddd1b993",
    "source": "55472d186a71c68a7e03f28854973f11787ce69ff5f80a34daba5cf50791b8d1",
    "identity": "4ed36714d06cb05e62dbd0087f3ebedf540ab97fcee1e823774b7df49a151001",
    "selection": "46dd7cdd753bab696f39a4b902dc2a4835d26fd1280a07a1514fa64b324ec02e",
    "publicSelection": "52effb5d02103eb8be48f1e7202249ba4ea5edc42096d6b9cf4315fbc0800916",
    "observations": "159362b7c97cdf443e2b8c2dad85d44abbeb17d98ed1ab5d00a1df568edc86a3",
    "publicObservations": "212abcf486f17fc17bc3367b8577bc319f78386f859e43c1e284bc1e0225e9c4"
  },
  "107": {
    "printing": "9f2ec684-fa0d-4308-86b1-cc11a4cd4d54",
    "variant": "e57c0e22-231e-4ea1-8d70-0272f5b0dd69",
    "provider": "neo4_ja-107",
    "category": "Trainer",
    "row": "dff0970928565bae25d93292951023e5e3263a2447a6ab78fdeaa923796d040f",
    "historical": "ca16c46ff654164c9d86e8a1c7a413e3388084777bac353e09f6fa31cc2d56bc",
    "original": "48c742aec2886ec480fb63afa11b0dadb276373bd6d2050c55a690b2cff12bf0",
    "metadata": "92b6aea48e66b63365e14199939d51087698da9548e9fc294f2c0fb7ddeb7e0a",
    "actual": "39a779ee74aa9b8e615f0c6308846bb0f6a32103db7ed8fd57eeca8ba3a883b1",
    "historicalActual": "39a779ee74aa9b8e615f0c6308846bb0f6a32103db7ed8fd57eeca8ba3a883b1",
    "source": "5d62dca5b8848b6a0ae1e3706f1192f4d035b2b4ef96dd3ec168e984a131104d",
    "identity": "2d49c137c9fe778ea0c7e85e7858c8edd0425afcc340dc0b90e4e78dac63fabd",
    "selection": "7896c37335b825e06aa6c112c15dec1843a9c19dc47745a643877e51ec58c48e",
    "publicSelection": "9f433993193abf55aa56f2aee2485dfb01920ed3349e337c2071b7d001c31805",
    "observations": "ade0ec5b2ff37ffcae4e51507564855a6c601dcb378d5da8ebbdb35ecf41e846",
    "publicObservations": "d4aca9f098f608271c6dab607f78335de053caeef03bc7f482c92389beba00e8"
  },
  "108": {
    "printing": "a210caa0-de01-4caf-aa35-1367a99723f1",
    "variant": "f4a81b91-eba3-4ad6-9d64-eeb19384d48a",
    "provider": "neo4_ja-108",
    "category": "Trainer",
    "row": "befa5e66e3674ae1b5390905cceadd103f42e7edd01975d09c529e3984e81107",
    "historical": "a02a32f14d61598004c2885191e590649a39cfb6678a69daff80758ad25e2f9d",
    "original": "c750ef6460a2d090b98d996d6aeacb2e5f1afbf45aa5d0e518eca6c5858a28ea",
    "metadata": "e5f0726053751e71c09a314434bb7128f44482c7a9c7ed340fe12e50aeb5b9f9",
    "actual": "aaf6bffb8829552698661c5df3ff9ec42849a1292bf15a402270db6be225b46a",
    "historicalActual": "aaf6bffb8829552698661c5df3ff9ec42849a1292bf15a402270db6be225b46a",
    "source": "41af9613d5c9a60e7e02bedba408115db92257307ec8e88ad2800f0d9b4dc70f",
    "identity": "cd86238d4884a9ce4924fb867b3f496e71ef9692059681987657ba651d9ebe73",
    "selection": "261716411d961d0022a117eab1a0508afe21ed5c742b4a224b66168d76dc5a0f",
    "publicSelection": "deb75c911ca16ac5e29c432d70be87bc8d432d04df40055f0217af2596a8b3de",
    "observations": "a9a403839c7a842d7c2ee49db2c40024e8bacdbb6a63852887d7c1546c743ef3",
    "publicObservations": "724a6a6b4268b9552b6b49bf15940159e1e48d8b9d79f5b19b71b11e4e777cb3"
  },
  "109": {
    "printing": "a61b14c6-e3f0-45b6-8b8e-09b175969400",
    "variant": "f20b6f01-d00d-43b2-8222-1248d003d52c",
    "provider": "neo4_ja-109",
    "category": "Trainer",
    "row": "2b01bdeb096d679c6cc9677fad8a2c5ee0bf776812538a0d2642a672f38d0997",
    "historical": "14cd4c0eca88e9deaa4cfd4be9bced27eff4b1de90675c0ccd1d44c193e25504",
    "original": "4bb18b87b3a66a534f6df2182a1dde6f8593be165f58592016906b0367e7ec8e",
    "metadata": "5b239d0febdc1f9977cf806ef405e021a6fcfa78fc6e9d134c377d596b46f46f",
    "actual": "0530a06d0d4f7cb00b4d268d1bd7fdd0b14f07d222659fcb07b2a5f6610a0a01",
    "historicalActual": "0530a06d0d4f7cb00b4d268d1bd7fdd0b14f07d222659fcb07b2a5f6610a0a01",
    "source": "86643cd2f583555ce74aaafee009814781b04d3ea7a56a5e3ee2cd25bb2d7c66",
    "identity": "39a3bec200daaa6104009a5921d9700799985ba1dceefcf88dbe5fd21aa34baf",
    "selection": "1c09f86769d45cbdff52de88e5d54008bbf4ca36754824cf7fb120150230ff7b",
    "publicSelection": "bfd47c9cb497e7080b0514c0754c493491046bdd19a17ae61bb1fec1333a5365",
    "observations": "fb93345da9e60dbab430f2c5c1f695b5b122a7b4b50f8fe2fdf7dc11f6f955b2",
    "publicObservations": "d59ec1265965cfc2b95b8a56084a18fd1031d835dc67dc27bbbf620652a23af1"
  },
  "110": {
    "printing": "9d182887-d279-4aa8-bfd4-7c3c53ddd834",
    "variant": "b3263116-6453-43e3-b209-953e6706ce3e",
    "provider": "neo4_ja-110",
    "category": "Trainer",
    "row": "d54f1355b251d99af47ddb1838f5e89f361fcaea86db63b95e3aeaa3d07a75ef",
    "historical": "4a3bbae6385b69a3473100498c48a7caae50a0c595064738d39c03dec1e752b4",
    "original": "e2f100fee5ddefeef34f4c0f50ec745515abecee7e8449a8c4cf7820f1764844",
    "metadata": "e3dfd21182018443ad3521e0789367e8b75302bdca5a3bb9f5c0f76ed1423a5e",
    "actual": "9791aac89fecdd296ef9aed811695ef5bbbe75e86b80595e80f146cfa9fd0776",
    "historicalActual": "9791aac89fecdd296ef9aed811695ef5bbbe75e86b80595e80f146cfa9fd0776",
    "source": "5a4f2838a028da428786268c93e259a15302223a7812699c9b5d23045669f110",
    "identity": "838de5f4216e9967ff0225cb58e73d8834fc06e23a959fade599314132848c07",
    "selection": "87d9d480d612f883042b3f489415f2d99f9cf8112344c47d3bf12809e11bbf18",
    "publicSelection": "4157925d3636e850288ca4b17f2e166f6068ebff08c5fa14ffefecae9bfe48d0",
    "observations": "05ef200c7f3e6c623c85de3d9b5549fa13d6c24f3aba0d6c406bc7baf80973e7",
    "publicObservations": "68fbd6b4487ffbb64a3b13b28cc5d4517269eb4f6f873817e11e2426cb298e1d"
  },
  "111": {
    "printing": "8b7bdb6b-ae3b-4b2b-8965-013c218b5766",
    "variant": "718cd280-e3dc-4817-b1b2-059ea8a8306a",
    "provider": "neo4_ja-111",
    "category": "Trainer",
    "row": "5ea0d4130ec0f768de2acd95417138e884b7ed11c860eaa1c04832349b1f79e8",
    "historical": "c1620fce0af74c81d1cae36d7e4b126123d7c98d7b9da9bef4168056858b0d2b",
    "original": "70e34a8973615ac20266da169456ec063b51c25626cfbac6fe6aca2d957936e0",
    "metadata": "cd58d6d85a95c5a2290ddbb7f389b3f4719f24038bb2f26ad696499f68f3e7dc",
    "actual": "0e4c01aa7259db480695d318b35f59fef8cdac632c3a237d2a76ce4ac8b954ab",
    "historicalActual": "0e4c01aa7259db480695d318b35f59fef8cdac632c3a237d2a76ce4ac8b954ab",
    "source": "d5470bf0faf1520e87fda3a14120c8997205c47ecc37203f71a3d2b39971d5fb",
    "identity": "0e8c1bd01be9bec5e6e0cdc75503d89f7d21f283ea0fc380b5eb979b95cac9af",
    "selection": "067f6748fec9545958e6f0b5b59db99102ae7d0e3f555dd0a190fd26798e1028",
    "publicSelection": "ecc46e26945c60e48479b8b3dee7bfab10edaef8d2d051550aebcd35eff8e786",
    "observations": "6837e295d954f5d0cdb223f23f2a359dcbd93e5247c0a11e8943ae532e34172a",
    "publicObservations": "fdb372e629e8bfbde93b1da6d452c14c802d1fb542da5b73cd2e8777f3baaa0d"
  },
  "112": {
    "printing": "3cea11be-02b2-4f43-b394-270fc6cf752e",
    "variant": "de289be1-707f-4405-850c-c760ce86faab",
    "provider": "neo4_ja-112",
    "category": "Trainer",
    "row": "31ea1b6935af67c9f38eef01e870106526081624f811a9ca7a1358de9b0da124",
    "historical": "f0c53b001ca1791ee372b5e6b6bb7965841234d3397fffc1e0f4680483228adf",
    "original": "ac013fd3b3e6d70df10731a07b3e33e9d0e099623ad98a61f1e4695e730bed3a",
    "metadata": "1c80d5babe3403e3ba0093605f27d484efed643568a0180a6b11593fb8c2115a",
    "actual": "d2724114cabf99561c5de1dfe420ea84abe903ad55bb49d815c529366589f127",
    "historicalActual": "d2724114cabf99561c5de1dfe420ea84abe903ad55bb49d815c529366589f127",
    "source": "d8b30104b4d8cf0268d34019cbc193cd7938c7f7cab6acca3276bce01db5afba",
    "identity": "633851a2080a54d98d689027eb8abddb359c069302169ab009035f486ade0c0b",
    "selection": "553acb1f4921bce05bbd1f963f1375476f093d35448dad44ee5676245d86c516",
    "publicSelection": "4f98d914c1a9775da0f08b5a5093bfb646a3e24b6b884f3bd5e359a87af75c10",
    "observations": "0ba3cdc1a1994f26b6b8a5ab612ebf7725b6e3528d40a85c23e19efcf6b3024a",
    "publicObservations": "32ff0c44bfc351bff28fde41852e44bcfbed51eb8af8347a8e66a644feaf44da"
  },
  "113": {
    "printing": "6c0f9c08-1fc4-4f4e-8c01-bf9db820e06a",
    "variant": "43e4450e-f35b-482d-987c-64b0a546f1f5",
    "provider": "neo4_ja-113",
    "category": "Energy",
    "row": "52f050708a34f57574d0f1d9cb422e5c1612262849c21ee839b935d4731f558b",
    "historical": "eda80cbe7b8f00fb0526ebeec4f0750605c2d825c42289bbc81246baf7620b95",
    "original": "22754251005f8d21b4e358a059829850c7b795fc76f5a67d84dd1b49f7faecf3",
    "metadata": "9c1ef2c5a314f2713ecd6c6fe0401b68f307c3295a63565413c31a7663350048",
    "actual": "b0b19ee0e35f05df2bf0c687a12eb3f2008a12aabce3ef120abac943f29b3add",
    "historicalActual": "b0b19ee0e35f05df2bf0c687a12eb3f2008a12aabce3ef120abac943f29b3add",
    "source": "93cae492f44abe240b5bfc85cab87fa73046292a126697be4f07f86badca9d42",
    "identity": "80a885127d2d86a493b2da2107305db330382774c1a2759242e4732a4bb30a15",
    "selection": "ba0ad7c75fffd37acbaa44178dcd55f88fca7ce77f51d9804d10c7b101925bf7",
    "publicSelection": "41223efe3a048f19dcf467a6ea72618b4941d1191ed80364686547c18d6e7374",
    "observations": "53d2fc03c756bb547ab3419fe426941481bddf695cd1618556b6fdbc6b3af806",
    "publicObservations": "0c38487bfbda2a9f210f63857dc09bc9a4dee31a425c47e9a0d8239f1b8667eb"
  },
  "229": {
    "printing": "b1b031a2-2e81-4602-90ad-57cab1a04ef0",
    "variant": "ae5bf6c7-5706-40ed-9042-330ab173dbe5",
    "provider": "neo4_ja-24",
    "category": "Pokemon",
    "row": "b3546fa09c08ca5e3c7df3c29bcfab12a836ba2446411c4682d9c940de0555d8",
    "historical": "831e100fa61fbc06f31f47931ccc126ce3e2f680300445c48db2d5869c985df8",
    "original": "130986ffbfc32ce1e6f9201aba739c68b4c80b66f5f5d1cadc7c3887561adb30",
    "metadata": "9d549d7eeb931ff4d38400d958ce342218492707701c0ccaac3e62f45f03aae8",
    "actual": "8995d438180baf5e99764502e053748ebbd73c4f109461b285e9381c3c5643ec",
    "historicalActual": "8995d438180baf5e99764502e053748ebbd73c4f109461b285e9381c3c5643ec",
    "source": "9db7ce5cc16fd52961a0625f82230a6135fc1188c37f92d29aba32d039c98c60",
    "identity": "efe9d6c644040b6c0c874fb7f10bf4b9c224fbaaa3a0315fe001bc35d9f66eb1",
    "selection": "2b325e5cd652c3eca44505c391f8dcc3df346d2227e823bb0950fbd2254da142",
    "publicSelection": "b675a4176a6b5292ed92e3cf1dfcd58c75badc6c2242260ea2f2b7dcfc755571",
    "observations": "9e3a37b6f2627429f6b8b2de41f737d087c9ca039b6f09d38edf796a67bad15f",
    "publicObservations": "ffbdcbebd382ebe631e48125e498b899d82673c89c36cae2e5fa930b297d0f0f"
  }
}; // Populated offline from the pinned root-approved13 packet.
const privatePathFields = new Set(['path', 'absolutePath', 'originalPath']);
const commercialFields = new Set(['pricing', 'prices', 'marketplaces', 'pop_reports', 'provider_metadata']);

export function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key, nested]) => {
    if (privatePathFields.has(key)) { check(typeof nested === 'string' && /^[A-Za-z]:[\\/]/u.test(nested), 'Unexpected private path projection'); return false; }
    check(!commercialFields.has(key), 'Commercial raw fields belong offline only');
    return true;
  }).map(([key, nested]) => [key, publicProjection(nested)]));
  check(typeof value !== 'string' || !/^[A-Za-z]:[\\/]/u.test(value), 'Private local path in public projection');
  return value;
}
export const publicationBody = body => publicProjection(body);

function knownFor(alias) { const known = expectedRows[alias]; check(known, 'Unknown exact13 alias'); return known; }
function validateActual(actual, category, alias) {
  const known = knownFor(alias);
  check(category === known.category && canonicalHash(actual) === known.actual, 'Exact accepted actual signature changed');
  check(actual.originalSha256 === known.original && actual.artistReadCertain === (alias !== '112'), 'Original/artist reading changed');
  if (category === 'Pokemon') {
    check(alias === '229' && actual.actualLanguage === 'ja' && actual.nationalDex === 229 && actual.printedDexText === 'No.229' && actual.printedNumberIsNationalDex === true, 'Only exact Houndoom printed National Dex229 accepted');
    check(actual.canonicalCollectorAliasIsNotSourceOrdinal === true && actual.sourceOrdinal24IsNotPrintedCollectorNumber === true && actual.canonicalCollectorAliasNotUsedForMatch === true, 'Canonical alias/source ordinal must not become printed collector number');
    check(actual.hp === 60 && actual.retreat === 1 && actual.orderedAttacks.length === 2 && actual.orderedAttacks[1].damage === '30+' && actual.orderedAttacks[1].effect.includes('20') && actual.orderedAttacks[1].effect.includes('悪'), 'Complete Houndoom gameplay witness required');
    return;
  }
  check(actual.actualLanguageCode === 'ja' && actual.printedNumberIsNationalDex === false && actual.canonicalCollectorAliasNotPrintedNumber === true, 'Positive unnumbered Japanese non-Pokemon witness required');
  for (const field of ['hp', 'stage', 'evolvesFrom', 'nationalDex', 'printedCollectorNumber', 'printedDexNumber', 'retreatSymbols']) check(actual[field] === null, `Non-Pokemon borrowed field: ${field}`);
  for (const field of ['orderedAttackNames', 'orderedAttackCosts', 'orderedAttackDamage', 'abilityNames', 'nativeAttackText']) check(same(actual[field], []), `Non-Pokemon borrowed attack: ${field}`);
  check(actual.fullCardFrontVisible === true && actual.allFourOuterEdgesVisible === true && actual.setSymbolObserved === true && actual.nativeRules.length > 0 && actual.nativeRulesText === actual.nativeRules.join('\n'), 'Complete actual Japanese rules/frame required');
  if (category === 'Energy') check(alias === '113' && actual.header === 'ENERGY' && actual.printedSubtype === '特殊エネルギーカード' && actual.nativeRules.length === 4 && actual.energySymbolCount === 2 && actual.nativeRules[0].includes('番の終わり') && actual.nativeRules[2].includes('でないとき') && actual.nativeRules[3].includes('デッキに1枚'), 'Exact Miracle Energy four-rule body required');
  else check(category === 'Trainer' && actual.header === 'TRAINER', 'Exact Trainer header required');
  if (alias === '112') check(actual.artist === null && actual.sourceRecordedArtist === 'Yousuke Hirata' && actual.visiblePrintedArtistSuffix?.includes('Hirata') && actual.artistOpticalQualification, 'Only112 qualified null artist accepted');
  if (alias === '110') check(actual.artist === 'Tomokazu Komiya' && actual.nativeRules.length === 2 && actual.nativeRules[0].includes('ベイビィ') && actual.nativeRules[0].includes('たね') && actual.nativeRules[0].includes('1個') && actual.nativeRules[1].includes('スタジアム'), 'Whole Stadium body required');
}

export function validateSourceRow(raw, historical) {
  const known = knownFor(raw.canonicalCollectorAlias);
  check(canonicalHash(raw) === known.row && canonicalHash(historical) === known.historical, 'Pinned approved/historical row changed');
  check(raw.printingId === known.printing && raw.variantId === known.variant && raw.selectedSourceCardId === known.provider && raw.approvedSourceCardId === known.provider && raw.historicalSelectedSourceCardId === null, 'Exact independent source binding required');
  check(raw.holds.length === 0 && raw.comparisonOnly === false && Object.values(raw.identityMatch).every(value => value === true) && raw.eligibleForPreparation === true && raw.preparationApproved === true && raw.publicationApproved === false, 'Finite accepted source state changed');
  check(raw.historicalSourceHandoffRowCanonicalJsonSha256 === canonicalHash(historical) && canonicalHash(raw.historicalActualPixelSignature) === raw.historicalActualPixelSignatureSha256 && canonicalHash(raw.actualPixelSignature) === raw.actualPixelSignatureSha256 && canonicalHash(raw.sourceSignature) === raw.sourceSignatureSha256, 'Raw and accepted signatures must retain truthful hashes');
  check(canonicalHash(raw.independentSelection) === raw.independentSelectionRowCanonicalJsonSha256 && same(raw.independentSelection.acceptedActualPixelSignature, raw.actualPixelSignature), 'Independent actual selection changed');
  check(raw.original.sha256 === known.original && raw.original.fullPILDecodePassed === true && raw.original.fullSharpDecodePassed === true && raw.original.sourceBytesUnchanged === true && raw.original.generatedOrUpscaled === false && raw.original.hdThreshold720x1008 === false, 'Unmodified readable original required');
  for (const field of ['vendorLicenceVerified', 'underlyingCopyrightLicenceVerified', 'sourceWideApproval', 'physicalEditionVerified', 'physicalFinishVerified']) check(raw[field] === false, `Unsupported source claim: ${field}`);
  validateActual(raw.actualPixelSignature, raw.acceptedCategory, raw.canonicalCollectorAlias);
  return raw;
}

export function projectQueueControls(raw) {
  const actual = raw.actualPixelSignature, category = raw.acceptedCategory, alias = raw.canonicalCollectorAlias;
  validateActual(actual, category, alias);
  const common = { canonical_alias: alias, current_native_label: raw.currentNativeLabel, verified_printed_native_name: actual.nativeName, current_native_label_not_used_for_match: true, accepted_category: category };
  const qa = { original_sha256: raw.original.sha256, source_metadata_sha256: knownFor(alias).metadata, actual_pixel_signature_sha256: raw.actualPixelSignatureSha256, physical_finish_verified: false, independent_named_reference_and_source_front_match: true, reference_image_comparison_only: true };
  if (category === 'Pokemon') return {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: true, name_number_and_symbol_readable: true, artist_read_certain: true, copyright_year_inferred: false, physical_finish_verified: false },
    identity_controls: { ...common, canonical_alias_is_not_printed_national_dex: true, printed_national_dex: 229, source_ordinal_is_not_printed_collector_number: true },
    source_qa: { ...qa, actual_japanese_full_front_verified: true, ordered_costs_and_damage_verified: true, all_provider_discrepancies_pixel_resolved: true },
  };
  const energy = category === 'Energy';
  return {
    pixel_observations: { whole_original_inspected: true, full_frame_visible: true, name_and_set_symbol_readable: true, artist_read_certain: actual.artistReadCertain, full_japanese_trainer_rules_read: !energy, full_japanese_energy_rules_read: energy, printed_collector_number: null, printed_national_dex: null, printed_number_is_national_dex: false, physical_finish_verified: false, copyright_year_inferred: false },
    identity_controls: { ...common, canonical_alias_is_not_printed_number: true, printed_collector_number: null, printed_national_dex: null, printed_number_is_national_dex: false, pokemon_identity_asserted: false, trainer_full_body_art_reference_bridge_verified: !energy, energy_full_body_art_reference_bridge_verified: energy },
    source_qa: { ...qa, actual_japanese_unnumbered_trainer_front_verified: !energy, complete_native_trainer_body_verified: !energy, actual_japanese_unnumbered_energy_front_verified: energy, complete_native_energy_body_verified: energy, printed_number_and_national_dex_absent_verified: true },
  };
}

export function projectSourceBody(raw, historical, fullProvider) {
  validateSourceRow(raw, historical);
  const identity = raw.sourceMetadataCapture.data ?? raw.sourceMetadataCapture;
  const selection = publicProjection(raw.independentSelection), pixels = publicProjection(raw.pixelObservations);
  return publicationBody({
    accepted_category: raw.acceptedCategory,
    provider_metadata_identity_projection: identity, provider_metadata_identity_projection_sha256: canonicalHash(identity),
    provider_metadata_projection_contract: 'Unchanged identity-only projection from pinned retained metadata. Full raw HTML and full captured JSON, including irrelevant commercial fields, remain offline only.',
    provider_metadata_raw_html_sha256: knownFor(raw.canonicalCollectorAlias).metadata,
    provider_metadata_full_captured_json_file_sha256: raw.sourceFullCapturedMetadata.sha256,
    provider_metadata_full_captured_json_sha256: canonicalHash(fullProvider),
    source_signature: raw.sourceSignature, source_signature_sha256: raw.sourceSignatureSha256,
    actual_pixel_signature: raw.actualPixelSignature, actual_pixel_signature_sha256: raw.actualPixelSignatureSha256,
    actual_pixel_observations: pixels, accepted_observations_raw_canonical_json_sha256: canonicalHash(raw.pixelObservations), accepted_observations_public_canonical_json_sha256: canonicalHash(pixels),
    historical_source_handoff_sha256: raw.historicalSourceHandoffSha256,
    historical_source_handoff_row_canonical_json_sha256: canonicalHash(historical), approved_projection_row_canonical_json_sha256: canonicalHash(raw),
    historical_actual_pixel_signature: raw.historicalActualPixelSignature, historical_actual_pixel_signature_sha256: raw.historicalActualPixelSignatureSha256,
    historical_pixel_observations: publicProjection(raw.historicalPixelObservations),
    historical_association: { selected_source_card_id: raw.historicalSelectedSourceCardId, capture_mode: raw.historicalCaptureMode, comparison_only: raw.historicalComparisonOnly, holds: raw.historicalHolds },
    accepted_provider_metadata_discrepancies: raw.providerMetadataDiscrepancies,
    independent_selection: selection, independent_selection_raw_canonical_json_sha256: canonicalHash(raw.independentSelection), independent_selection_public_canonical_json_sha256: canonicalHash(selection),
    public_projection_contract: 'Remove only explicit path, absolutePath and originalPath fields. Raw/private row/signature/file hashes remain historical facts; separate public projection hashes cover the path-free serialization. No commercial raw body is published.',
    current_acceptance: { source_card_id: raw.selectedSourceCardId, independently_accepted: true, category: raw.acceptedCategory },
    source_variant_support: { currentFinishCode: raw.currentProduction.finish_code, physicalFinishVerified: false },
    physical_edition_verified: false, physical_finish_verified: false, generic_other_rows_may_relax: false,
    queue_controls: projectQueueControls(raw),
  });
}

export function validatePublishedWitness(body, row) {
  check(same(publicationBody(body), body), 'Public body contains a private field');
  const alias = row.collector_number, known = knownFor(alias);
  validateActual(body.actual_pixel_signature, body.accepted_category, alias);
  check(row.printing_id === known.printing && row.objects[0].sha256 === known.original, 'Published exact identity/original changed');
  check(canonicalHash(body.source_signature) === known.source && body.source_signature_sha256 === known.source && canonicalHash(body.historical_actual_pixel_signature) === known.historicalActual && body.historical_actual_pixel_signature_sha256 === known.historicalActual, 'Published raw signature changed');
  check(canonicalHash(body.provider_metadata_identity_projection) === known.identity && body.provider_metadata_identity_projection_sha256 === known.identity, 'Published identity projection changed');
  check(body.approved_projection_row_canonical_json_sha256 === known.row && body.historical_source_handoff_row_canonical_json_sha256 === known.historical && body.independent_selection_raw_canonical_json_sha256 === known.selection && canonicalHash(body.independent_selection) === known.publicSelection && body.independent_selection_public_canonical_json_sha256 === known.publicSelection && same(body.independent_selection.acceptedActualPixelSignature, body.actual_pixel_signature), 'Published selection/raw history changed');
  check(body.accepted_observations_raw_canonical_json_sha256 === known.observations && canonicalHash(body.actual_pixel_observations) === known.publicObservations && body.accepted_observations_public_canonical_json_sha256 === known.publicObservations, 'Accepted source observation changed');
  check(same(body.queue_controls, projectQueueControls({ canonicalCollectorAlias: alias, currentNativeLabel: row.card_native_name, acceptedCategory: body.accepted_category, actualPixelSignature: body.actual_pixel_signature, actualPixelSignatureSha256: body.actual_pixel_signature_sha256, original: { sha256: known.original } })), 'Exact category queue controls changed');
  return body;
}
