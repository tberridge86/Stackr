-- Exact, audited TCGdex set release-date backfill for the four-language launch catalogue.
-- Evidence: catalogue/tcgdex-set-release-date-evidence-2026-08-20.json
-- evidence-row-count: 96
-- evidence-rows-sha256: 301c374d7443a3647640bef1bafd2b711d851f8fd45ae81b39e4c8151dc6678b
-- sql-rows-sha256: 148064135c79219a57abc93e95c5d9d2fe334455583cb9907a9eb8042ae2c5a5
-- Safety: match existing current exact TCGdex identifiers only; fill NULL dates only;
-- reject missing/ambiguous/conflicting targets; create no catalogue identities.

create temporary table _stackr_tcgdex_set_release_dates (
  language_code text not null,
  external_id text not null,
  release_date date not null,
  source_url text not null,
  provider_payload_sha256 text not null,
  primary key (language_code, external_id),
  check (language_code in ('en', 'ja', 'zh-Hant', 'zh-Hans')),
  check (provider_payload_sha256 ~ '^[0-9a-f]{64}$')
) on commit drop;

insert into _stackr_tcgdex_set_release_dates (
  language_code, external_id, release_date, source_url, provider_payload_sha256
) values
  ('ja', 'ADV1', '2003-01-31', 'https://api.tcgdex.net/v2/ja/sets/ADV1', '809fe0326dd8be79ac0d80658c720b9002ad805e5be1de4814652aa1f85e5a50'),
  ('ja', 'ADV2', '2003-04-18', 'https://api.tcgdex.net/v2/ja/sets/ADV2', 'a7987eab6c5b3c05df7433ba7d714928e6637f1e418e7cac5827751dbfc6a1a4'),
  ('ja', 'ADV3', '2003-06-25', 'https://api.tcgdex.net/v2/ja/sets/ADV3', 'f26db68514d7f82c0812f3ac97c145205cf0548d6e6325951378f1b040c69348'),
  ('ja', 'ADV4', '2003-10-24', 'https://api.tcgdex.net/v2/ja/sets/ADV4', '76906cb9d2ff8fd5efe549943cbe224f2d31c136309b580e31f2cfabfed6ec8a'),
  ('ja', 'ADV5', '2004-01-16', 'https://api.tcgdex.net/v2/ja/sets/ADV5', '7d1ab91a50011dbd2c4fd41b46f82999107465a80b81b16a42d08068d2068dea'),
  ('ja', 'CP1', '2015-01-30', 'https://api.tcgdex.net/v2/ja/sets/CP1', '7ffdd45b3d835af326139707b44df8a41f5fd8e0a0e775ba67398ed2047f095a'),
  ('ja', 'CP3', '2016-01-29', 'https://api.tcgdex.net/v2/ja/sets/CP3', 'f660f545f87888acd98c9691cf2719983ca1e393d4e9eea891664cb8039366ae'),
  ('ja', 'CP5', '2016-07-16', 'https://api.tcgdex.net/v2/ja/sets/CP5', '0e8314cfaeea642b5c6151d31dd6d2572f5c7e48251cb46c19e7914d58219195'),
  ('ja', 'E1', '2001-12-01', 'https://api.tcgdex.net/v2/ja/sets/E1', 'c92c41e86206d0cda06959270b9787a65c1729d2fa640117fc40fee13eddf423'),
  ('ja', 'E2', '2002-03-08', 'https://api.tcgdex.net/v2/ja/sets/E2', '7bd94d458f9718ad96121e518d7e37b0b5a74127c75053504017d525e5de4dca'),
  ('ja', 'E3', '2002-05-24', 'https://api.tcgdex.net/v2/ja/sets/E3', 'ca53d84e2a9211adb9002422504c1a3347eb32af5dafb67bb0d60e64c912ab0b'),
  ('ja', 'E4', '2002-08-23', 'https://api.tcgdex.net/v2/ja/sets/E4', '74b681d1f5199571664753f45a9f8454e19b299c6c06e8d09366e03debf3f0e5'),
  ('ja', 'E5', '2002-10-04', 'https://api.tcgdex.net/v2/ja/sets/E5', 'db163d3430b1d79c65ccbbbe6154964cbd6e7d1a89cc4d816b2e46b7ceb6ece3'),
  ('ja', 'L1a', '2009-10-09', 'https://api.tcgdex.net/v2/ja/sets/L1a', '7977de63d24dbc9c2dce674488d0e9c7fb2f9c4fc056f3ef8b14b45baa8bfb1b'),
  ('ja', 'L1b', '2009-10-09', 'https://api.tcgdex.net/v2/ja/sets/L1b', '27dde10557af34b50f9b875f3f47211585eaa05f898c565ce90c6321ddf3b505'),
  ('ja', 'L2', '2010-02-11', 'https://api.tcgdex.net/v2/ja/sets/L2', '63abc6fc322b01853e935957ff98c3ca15e48454d6c0ee05f68481a1a5490920'),
  ('ja', 'L3', '2010-07-08', 'https://api.tcgdex.net/v2/ja/sets/L3', '8b5db2ee12da992cdb0c6c1ae150c1de74ba9c725cd98e26d84137e17f7b5163'),
  ('ja', 'LL', '2010-04-16', 'https://api.tcgdex.net/v2/ja/sets/LL', '63f34ed073877572fad95501cbc688500ba85f42229f289ec457282268a56f1c'),
  ('ja', 'M-P', '2025-07-28', 'https://api.tcgdex.net/v2/ja/sets/M-P', 'eda4551005056254040c4a798aa8f4fc2dcc4deed9f3aed7198cc668be540ec8'),
  ('ja', 'M1L', '2025-08-01', 'https://api.tcgdex.net/v2/ja/sets/M1L', 'f5b61af1c70092a233403c2d7cdcc2d14729a5a33ce158e382459eaaf6e9dbfa'),
  ('ja', 'M1S', '2025-08-01', 'https://api.tcgdex.net/v2/ja/sets/M1S', '6b163012b22e328dc15b70bcf88835ac798f52bc828d40d5394cb1a262ed4fde'),
  ('ja', 'M2', '2025-09-26', 'https://api.tcgdex.net/v2/ja/sets/M2', 'fa709531993cf7c2fe23f4107a28f016f9ded66aea044158deb7e78c055dcaf7'),
  ('ja', 'M2a', '2025-11-28', 'https://api.tcgdex.net/v2/ja/sets/M2a', 'ea461822fb7e9a50fd650c764c8e0df81db573a3ee27f4bf89a6e01cd58c7b52'),
  ('ja', 'M3', '2026-01-23', 'https://api.tcgdex.net/v2/ja/sets/M3', '9ff151033d3670f4c432c36fc6c8d36ba5d5b2faa1697488baa3927056505d30'),
  ('ja', 'M4', '2026-03-13', 'https://api.tcgdex.net/v2/ja/sets/M4', 'f3ef1722c044a60f498e6a4dfd02b4c464c39524e3418b90446d0497a7649924'),
  ('ja', 'M5', '2026-05-22', 'https://api.tcgdex.net/v2/ja/sets/M5', 'a392337d2d437ef5729cd267e718ab30042deaa129d504cc57d93f6d2454ef29'),
  ('ja', 'MC', '2025-12-19', 'https://api.tcgdex.net/v2/ja/sets/MC', '09aab72278f7c1cb7c59ff4ed43d6aa5bfb5b51939053e581a6479a73be72847'),
  ('ja', 'PCG1', '2004-04-09', 'https://api.tcgdex.net/v2/ja/sets/PCG1', '4538a4695805d983a27d66e394ad0e16347449d3f6627a3681b73f32e1a11827'),
  ('ja', 'PCG2', '2004-07-01', 'https://api.tcgdex.net/v2/ja/sets/PCG2', 'c0419eafa92a1f964cea02cc56d1efe9720ecd4ff131ec7b351a9af72ecec0d4'),
  ('ja', 'PCG3', '2004-10-15', 'https://api.tcgdex.net/v2/ja/sets/PCG3', 'c0c6adf8e121c63285cbcd604a77ff9604a368c2e5b80845324e85f65ee948be'),
  ('ja', 'PCG4', '2005-04-08', 'https://api.tcgdex.net/v2/ja/sets/PCG4', '054576095357c65a38a9e1bc67310169686cc4a6083da2f2fb5f43e7a1aec053'),
  ('ja', 'PCG5', '2005-06-30', 'https://api.tcgdex.net/v2/ja/sets/PCG5', 'a4f7edc9a4d50a4e084832486c8064a9b579decdb99e7917a55bed7a538b729a'),
  ('ja', 'PCG6', '2005-10-28', 'https://api.tcgdex.net/v2/ja/sets/PCG6', '8fe92a5190faad9f2c4334cd2821d4a9b55f6543bfd2f0a077ea9d4e4b67d405'),
  ('ja', 'PCG7', '2006-01-27', 'https://api.tcgdex.net/v2/ja/sets/PCG7', 'e8546b153de502b9a65e6d8502830fcb2a9f5ffb3e8d494556badbdb4e8521ef'),
  ('ja', 'PCG8', '2006-03-10', 'https://api.tcgdex.net/v2/ja/sets/PCG8', 'fc965afa7c1b8542cf2b3ab3c1a657cc35f8bceb814e119d7929a69351514879'),
  ('ja', 'PCG9', '2006-06-29', 'https://api.tcgdex.net/v2/ja/sets/PCG9', 'f2241c07ef07c68b106b6f49c8147acb50f16a534d8027a06e5618fc197e3c7f'),
  ('ja', 'PMCG1', '1996-10-20', 'https://api.tcgdex.net/v2/ja/sets/PMCG1', '3084ddb219f5122430b3bf747c3e8405bc7e419f82420a71f2cfe1b8b42eaa9e'),
  ('ja', 'PMCG2', '1997-03-05', 'https://api.tcgdex.net/v2/ja/sets/PMCG2', '8947c87f99dc7ca61114494d659760c193658909c466655e682d746549028cf4'),
  ('ja', 'PMCG3', '1997-06-21', 'https://api.tcgdex.net/v2/ja/sets/PMCG3', 'c4f376654f64fd71912d0d1f660740bb60fd581d7ecb1a75492d6964228e7c32'),
  ('ja', 'PMCG4', '1997-11-21', 'https://api.tcgdex.net/v2/ja/sets/PMCG4', '06e5484b4293119dc32a1d860a7da69852991f28cc2c551ddf45a255e4ef5b5e'),
  ('ja', 'PMCG5', '1998-10-24', 'https://api.tcgdex.net/v2/ja/sets/PMCG5', '78e2665c9f8733a50aa79414f31b3cbdc9f30bb410cb0e42c36d403ca5fa3932'),
  ('ja', 'PMCG6', '1999-06-25', 'https://api.tcgdex.net/v2/ja/sets/PMCG6', '588f6d4db856ffaa2c929363e94a24cc984ce53b044e80a1bfa6006e61e8324f'),
  ('ja', 'S10a', '2022-05-13', 'https://api.tcgdex.net/v2/ja/sets/S10a', 'bf721bb2a82ab582fc8b8cd8f360feba59be36a8de9573a561b769761a5e44ff'),
  ('ja', 'S10b', '2022-06-17', 'https://api.tcgdex.net/v2/ja/sets/S10b', '8f3309acd8aa8d5b381bbd08e710f3c12b064d8499676e967ac004b0e6f6422f'),
  ('ja', 'S10P', '2022-04-08', 'https://api.tcgdex.net/v2/ja/sets/S10P', 'dfb1cc74819a1644aa15866baadcb1167d704d2627c2503edcd3c41f810444a0'),
  ('ja', 'S11', '2022-07-15', 'https://api.tcgdex.net/v2/ja/sets/S11', 'dd4cdebfaeac3b174434bfd4d7ba6be90cc87d73aea55b5937b7b1a94f15128a'),
  ('ja', 'S11a', '2022-09-02', 'https://api.tcgdex.net/v2/ja/sets/S11a', 'cf627a6c87b05ea25de9340692de0fbe92da37145247e1f66916d607a69674c5'),
  ('ja', 'S12', '2022-10-21', 'https://api.tcgdex.net/v2/ja/sets/S12', '1f74ddb7aa6889ed15f4d74dd9e696c5f9fc992a13abbf2e72d0b3718264faa6'),
  ('ja', 'S12a', '2022-12-02', 'https://api.tcgdex.net/v2/ja/sets/S12a', '868c9f9cffa0fe5d8e0a3b5603c9d199460ec08b369c8612c945615f712cb5bb'),
  ('ja', 'S1W', '2019-12-06', 'https://api.tcgdex.net/v2/ja/sets/S1W', '72e0188d2c1770a13a8ae8f81698739ad4c15e5f981511a41116045a79787856'),
  ('ja', 'S5I', '2021-01-22', 'https://api.tcgdex.net/v2/ja/sets/S5I', 'a5b510417571b2789c4937a4a692014fb39f945d07b980b7fe7afe38d0df1d38'),
  ('ja', 'S6H', '2021-04-23', 'https://api.tcgdex.net/v2/ja/sets/S6H', 'de0564e4a3d4f1445cd8493c3dc318a45d3177b67214f294811df02dea3dc7e7'),
  ('ja', 'S6K', '2021-04-23', 'https://api.tcgdex.net/v2/ja/sets/S6K', '74f284406fb87473142ae02d6b857b2f7e5f311f0bcef39c7eb289eb1842b087'),
  ('ja', 'S7D', '2021-07-09', 'https://api.tcgdex.net/v2/ja/sets/S7D', '98543fc33f602eff641d8917953245bf08d058d585a108f9ffeb0c059b6efafe'),
  ('ja', 'S8', '2021-09-24', 'https://api.tcgdex.net/v2/ja/sets/S8', '022b5140f1316998b89d1906a84ba577c925c1cf430607bff2314d3c51734f99'),
  ('ja', 'S8a', '2021-10-22', 'https://api.tcgdex.net/v2/ja/sets/S8a', '249f32117b70d435a253c0a957c06a527e335e81986339551dc9dff7af8ac64d'),
  ('ja', 'S8b', '2021-12-03', 'https://api.tcgdex.net/v2/ja/sets/S8b', '3832ed00a479e9335a68bc40738f82b2c1dac8260a820a0549d817ff73457be2'),
  ('ja', 'S9', '2022-01-14', 'https://api.tcgdex.net/v2/ja/sets/S9', 'ce5e98c6afc44a982896a2afce86e429875f7556af291c4f131dd593cf0c90d0'),
  ('ja', 'S9a', '2022-02-25', 'https://api.tcgdex.net/v2/ja/sets/S9a', '766bd14ad3860c0d5e12d3b7bd73ea5a9b2209b1724deb7c76ac7b907ebdaa46'),
  ('ja', 'SM0', '2016-11-18', 'https://api.tcgdex.net/v2/ja/sets/SM0', '8901a8b13594842df941521af21a18dc5960099139cac05ddf08e5f06e737c53'),
  ('ja', 'SM10', '2019-03-01', 'https://api.tcgdex.net/v2/ja/sets/SM10', '7508557744ed31f6be3ffc0761d816a619dcad891ea7b966971bcf5e3684d7e5'),
  ('ja', 'SM10b', '2019-04-26', 'https://api.tcgdex.net/v2/ja/sets/SM10b', '94b8138ae2056b5b5cf14978ee251f6e6439b50dbf33bb613f2a847ec67a392c'),
  ('ja', 'SM11a', '2019-07-05', 'https://api.tcgdex.net/v2/ja/sets/SM11a', '7a691283de94b6e4427a6056f0e10e931dd7ba145ad19c8bf579d1b5a6dfd27b'),
  ('ja', 'SM11b', '2019-08-02', 'https://api.tcgdex.net/v2/ja/sets/SM11b', '3f852774301080aabbf8c3e5c9955864add55deb05735686d19284768a2f576f'),
  ('ja', 'SM12', '2019-09-06', 'https://api.tcgdex.net/v2/ja/sets/SM12', 'd70230010cc2cd6ff2a5e42c54f62ba93cc6350464716b43027ed03cf6c5ab35'),
  ('ja', 'SM12a', '2019-10-04', 'https://api.tcgdex.net/v2/ja/sets/SM12a', '90a47259bc1b46bc47cf8602723aaf2bdc1f6d5753e802fef422d2b2a9e589de'),
  ('ja', 'SM1M', '2016-12-09', 'https://api.tcgdex.net/v2/ja/sets/SM1M', '63f99ccbe29d15c478a1e419b99fb6e2e1294511cf9893c73755c89083fc7d18'),
  ('ja', 'SM1S', '2016-12-09', 'https://api.tcgdex.net/v2/ja/sets/SM1S', '6c819317d2d964bb9c9624745310d5cd3de8ef77b8c3d0328b2218f94718122f'),
  ('ja', 'SM2K', '2017-03-17', 'https://api.tcgdex.net/v2/ja/sets/SM2K', '60a2cf134d9e7ba85c9f570ba83f2abf8b1054f7dee6abc72ea9b9e4fee0f23f'),
  ('ja', 'SM2L', '2017-03-17', 'https://api.tcgdex.net/v2/ja/sets/SM2L', '154f3193c96bc3112e48dcffa73b3305483b658a1e16b343acdca53d263af3ce'),
  ('ja', 'SM3H', '2017-06-16', 'https://api.tcgdex.net/v2/ja/sets/SM3H', 'cd3b4e0ea433ab57a30cdcf2deddac47d27826f6ff602014f7111a80f899afd6'),
  ('ja', 'SM3N', '2017-06-16', 'https://api.tcgdex.net/v2/ja/sets/SM3N', 'c42b3467777ca9694949611250410085e9fc5926c6ab487544c34a10008037cf'),
  ('ja', 'SM4A', '2017-09-15', 'https://api.tcgdex.net/v2/ja/sets/SM4A', 'bfe744c8afd784b578d997465c6c3e429274cfccae336dd757b03b304f5dd4e7'),
  ('ja', 'SM4S', '2017-09-15', 'https://api.tcgdex.net/v2/ja/sets/SM4S', 'b5b5c4d07d823afb6ef60e530db58c8e59b97745a57533644264514811fc3401'),
  ('ja', 'SM5M', '2017-12-08', 'https://api.tcgdex.net/v2/ja/sets/SM5M', 'fd01413d94517fdca26cb908c87e63ff4e955cc50fc480e4c4c22da5c51ebf88'),
  ('ja', 'SM5S', '2017-12-08', 'https://api.tcgdex.net/v2/ja/sets/SM5S', '2aaa1d36a0e62bc99d4efdf02e7556c7e36906d759d69a8885ba65f7d305def0'),
  ('ja', 'SM6', '2018-03-02', 'https://api.tcgdex.net/v2/ja/sets/SM6', '45c73558b7b60060188cd8606e0f732f0979ba18d5c9f4f524c29b9f3654d94b'),
  ('ja', 'SM6a', '2018-04-06', 'https://api.tcgdex.net/v2/ja/sets/SM6a', '8882acae5224c2d98515da17d1f3c1515447661e91c633082bc85c81a22a56f8'),
  ('ja', 'SM6b', '2018-05-30', 'https://api.tcgdex.net/v2/ja/sets/SM6b', '7edab3b84bf9e04c227cd8a41a4a531b6e1d6dfcb5a21cd43ce8a89de351c9ab'),
  ('ja', 'SM7', '2018-06-01', 'https://api.tcgdex.net/v2/ja/sets/SM7', '7495becc3ea7f83afd27012ed9b3d89310e01075dec3e1f46a4b2ab4b19c1273'),
  ('ja', 'SM7a', '2018-08-03', 'https://api.tcgdex.net/v2/ja/sets/SM7a', 'bfabf36eb8d2adad93731bafdb508b42c35b6e591af85590aaf1a466307d6ee9'),
  ('ja', 'SM7b', '2018-08-03', 'https://api.tcgdex.net/v2/ja/sets/SM7b', '81ac2d91ae44ca92789edad647bd97323d2d950246d4920879c8929f56ebc2c7'),
  ('ja', 'SM8', '2018-09-07', 'https://api.tcgdex.net/v2/ja/sets/SM8', '7f9d471d3de89cafb258321abdedd08c6b1427d5c8153ce9727a9b87eb4f5499'),
  ('ja', 'SM8a', '2018-10-05', 'https://api.tcgdex.net/v2/ja/sets/SM8a', '82f04a62ee6a749b4d35ed153e765e769d963b2027f5fbd6d71271c84e8ae3e0'),
  ('ja', 'SM8b', '2018-10-05', 'https://api.tcgdex.net/v2/ja/sets/SM8b', '576303eb959018141dfe9f448db2d3aff490cf641e98bcc97dac0b0bff85fc3d'),
  ('ja', 'SM9', '2018-12-07', 'https://api.tcgdex.net/v2/ja/sets/SM9', '9498b3fb50073bd94d04a5a28c5ac60ef255eae95ed2190186bce0e782852381'),
  ('ja', 'SM9a', '2019-01-11', 'https://api.tcgdex.net/v2/ja/sets/SM9a', 'e5c77744a89fecb6f4dc614eb05ab42f7787f55a0362890f6eff71b8ddaf39e9'),
  ('ja', 'SM9b', '2019-02-01', 'https://api.tcgdex.net/v2/ja/sets/SM9b', '8de698730f9c621b860b7ead2bf8b9b1f6b5bc4e53760896163ce3476ddb6e84'),
  ('ja', 'SMP2', '2019-04-26', 'https://api.tcgdex.net/v2/ja/sets/SMP2', '29950be9833d352b28b947125902a2f89805c084058f409b0f78ebd349271e5a'),
  ('ja', 'SV10', '2025-04-18', 'https://api.tcgdex.net/v2/ja/sets/SV10', '0bb4039c2d603c45b84bf2d39cc2ba5821a17fad8a51e1335a2c986023955585'),
  ('ja', 'SV11B', '2025-06-06', 'https://api.tcgdex.net/v2/ja/sets/SV11B', 'ff432b7331d5b9e880b8edbfccceeb7b396b9d187e4aeadf6b68257597e205a0'),
  ('ja', 'SV11W', '2025-06-06', 'https://api.tcgdex.net/v2/ja/sets/SV11W', '067a668d6914f060cede6aa4a403351e1e76695ef65185e55d2ff4ef00bc9d1d'),
  ('ja', 'SV1a', '2023-03-10', 'https://api.tcgdex.net/v2/ja/sets/SV1a', 'bb0d2fa6cb7bd05c849adeddb64a4f7e20e5251b22b6ef8d172981f8df601c64'),
  ('ja', 'SV1S', '2023-01-20', 'https://api.tcgdex.net/v2/ja/sets/SV1S', 'de03f2a3521bb5f1307608f880490295188a731768b69a79964261f647afd48a'),
  ('ja', 'SV3', '2023-07-28', 'https://api.tcgdex.net/v2/ja/sets/SV3', '4454aaaf65e69e26abc9f4aac2e1d5fa80ae0c7f559a731802ad4c9bf14ef3ad'),
  ('ja', 'SVLN', '2024-08-30', 'https://api.tcgdex.net/v2/ja/sets/SVLN', 'ce1fb264e478abb92f37d14eb9726ae3e05a24d6d6e49064ae400836e4125bf8');

do $evidence$
declare actual_count integer; actual_sha256 text;
begin
  select count(*)::integer into actual_count from _stackr_tcgdex_set_release_dates;
  if actual_count <> 96 then
    raise exception 'TCGdex release-date evidence row count mismatch: expected %, got %', 96, actual_count;
  end if;
  select encode(extensions.digest(string_agg(concat_ws('|', language_code, external_id, release_date::text, source_url, provider_payload_sha256), E'\n' order by language_code, external_id), 'sha256'), 'hex')
    into actual_sha256 from _stackr_tcgdex_set_release_dates;
  if actual_sha256 <> '148064135c79219a57abc93e95c5d9d2fe334455583cb9907a9eb8042ae2c5a5' then
    raise exception 'TCGdex release-date evidence SHA-256 mismatch: expected %, got %', '148064135c79219a57abc93e95c5d9d2fe334455583cb9907a9eb8042ae2c5a5', actual_sha256;
  end if;
end
$evidence$;

create temporary table _stackr_tcgdex_release_targets on commit drop as
select evidence.language_code, evidence.external_id, evidence.release_date, evidence.source_url,
  evidence.provider_payload_sha256, catalogue_set.id as set_id, catalogue_set.set_code,
  catalogue_set.native_name
from _stackr_tcgdex_set_release_dates evidence
join ingest.sources source on source.code='tcgdex' and source.active and source.deprecated_at is null
join ingest.external_identifiers external_identifier
  on external_identifier.source_id=source.id
 and external_identifier.source_entity_type='set'
 and external_identifier.external_id=evidence.external_id
 and external_identifier.language_code=evidence.language_code
 and external_identifier.is_current
 and external_identifier.deprecated_at is null
 and external_identifier.set_id is not null
join catalog.sets catalogue_set
  on catalogue_set.id=external_identifier.set_id
 and catalogue_set.game_code='pokemon'
 and catalogue_set.language_code=evidence.language_code
 and catalogue_set.deprecated_at is null;

create temporary table _stackr_tcgdex_release_changes (
  set_id uuid primary key,
  language_code text not null,
  external_id text not null,
  set_code text,
  native_name text not null,
  release_date date not null,
  source_url text not null,
  provider_payload_sha256 text not null
) on commit drop;

do $backfill$
declare target_count integer; distinct_set_count integer; expected_update_count integer; updated_count integer;
begin
  select count(*)::integer, count(distinct set_id)::integer into target_count, distinct_set_count
  from _stackr_tcgdex_release_targets;
  if target_count <> 96 or distinct_set_count <> 96 then
    raise exception 'TCGdex release-date target reconciliation failed: expected % exact targets, got % rows / % sets',
      96, target_count, distinct_set_count;
  end if;

  perform catalogue_set.id
  from catalog.sets catalogue_set
  join _stackr_tcgdex_release_targets target on target.set_id=catalogue_set.id
  order by catalogue_set.id
  for update of catalogue_set;

  if exists (
    select 1
    from _stackr_tcgdex_release_targets target
    join catalog.sets catalogue_set on catalogue_set.id=target.set_id
    where catalogue_set.release_date is not null
      and catalogue_set.release_date <> target.release_date
  ) then
    raise exception 'TCGdex release-date backfill refused a conflicting non-null canonical date';
  end if;

  select count(*)::integer into expected_update_count
  from _stackr_tcgdex_release_targets target
  join catalog.sets catalogue_set on catalogue_set.id=target.set_id
  where catalogue_set.release_date is null;

  with changed as (
    update catalog.sets catalogue_set
    set release_date=target.release_date, updated_at=now()
    from _stackr_tcgdex_release_targets target
    where catalogue_set.id=target.set_id and catalogue_set.release_date is null
    returning catalogue_set.id, target.language_code, target.external_id, target.set_code,
      target.native_name, target.release_date, target.source_url, target.provider_payload_sha256
  )
  insert into _stackr_tcgdex_release_changes (
    set_id, language_code, external_id, set_code, native_name, release_date, source_url, provider_payload_sha256
  )
  select id, language_code, external_id, set_code, native_name, release_date, source_url, provider_payload_sha256
  from changed;

  get diagnostics updated_count = row_count;
  if updated_count <> expected_update_count then
    raise exception 'TCGdex release-date update count mismatch: expected %, got %', expected_update_count, updated_count;
  end if;
end
$backfill$;

insert into audit.catalogue_events (
  request_id, actor_role, event_type, entity_schema, entity_table, entity_id, canonical_key, event_payload, internal_notes
)
select 'catalogue-set-release-dates:2026-08-20:148064135c79219a', 'catalogue_migration', 'catalogue_set_release_date_backfilled',
  'catalog', 'sets', change.set_id,
  concat('pokemon:', change.language_code, ':', coalesce(change.set_code, change.external_id)),
  jsonb_build_object(
    'languageCode', change.language_code, 'externalId', change.external_id,
    'releaseDate', change.release_date, 'sourceCode', 'tcgdex', 'sourceUrl', change.source_url,
    'providerPayloadSha256', change.provider_payload_sha256,
    'evidenceRowsSha256', '301c374d7443a3647640bef1bafd2b711d851f8fd45ae81b39e4c8151dc6678b', 'sqlRowsSha256', '148064135c79219a57abc93e95c5d9d2fe334455583cb9907a9eb8042ae2c5a5'
  ),
  'Exact current TCGdex identifier; null-only release-date backfill.'
from _stackr_tcgdex_release_changes change;

insert into catalog.catalogue_change_log (
  entity_schema, entity_table, entity_id, change_type, mobile_syncable, public_change_summary
)
select 'catalog', 'sets', change.set_id, 'update', true,
  jsonb_build_object('field', 'release_date', 'releaseDate', change.release_date,
    'languageCode', change.language_code, 'sourceCode', 'tcgdex')
from _stackr_tcgdex_release_changes change;

do $postcondition$
begin
  if exists (
    select 1
    from _stackr_tcgdex_release_targets target
    join catalog.sets catalogue_set on catalogue_set.id=target.set_id
    where catalogue_set.release_date is distinct from target.release_date
  ) then
    raise exception 'TCGdex release-date backfill postcondition failed';
  end if;
end
$postcondition$;
