// Finite eight-front contract. Historical private evidence is never rewritten.
import { createHash } from 'node:crypto';
import { isDeepStrictEqual as same } from 'node:util';

const check = (value, message) => { if (!value) throw Error(message); };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const canonicalHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const expectedRows = {
  "60c39900-94fe-420b-b997-60e9c64f3491": {
    "alias": "073",
    "setCode": "neo1",
    "sourceCode": "scrydex",
    "provider": "neo1_ja-73",
    "row": "51602fcacc2a3b62f5120fa760ca2ac7f4f871787288b856e21c84ab6f3769e4",
    "peer": "79d5f2af5f1cf7cf54fa0e56a1c51082d341047c22935639ad11eb210362af78",
    "publicPeer": "89b02cc7ad004c3e8e226ef936db944e992bebfa40f09ad74d9a92a9145eac16",
    "original": "31d49627ce76df792c54f2108b5a0faec45a7ffa1fbeba77b933c19f3458f079",
    "metadata": "1998d2e285000686f935f22b048ce2dff5a3031610da36bf4a08c06a0071b380",
    "identity": "96adbf279c2a8e2130fb1ace2ba812adbfe5cb7b0f0532c8f327bc22b3837a77",
    "source": "96adbf279c2a8e2130fb1ace2ba812adbfe5cb7b0f0532c8f327bc22b3837a77",
    "actual": "b9d84af8e0808a07ea6494d132bd41d8eca1e18b3ac6a93c65f9f2f5cb2ce05b",
    "observations": "4c53227063f5530134be80a2151b36325efb4d20f25b1808eff3a26957da36fa",
    "publicObservations": "4c53227063f5530134be80a2151b36325efb4d20f25b1808eff3a26957da36fa",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-73/large",
    "production": {
      "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
      "set_code": "neo1",
      "game_code": "pokemon",
      "variant_id": "c21bd7f6-d7e6-487c-ac76-00a7d218d95c",
      "finish_code": "normal",
      "printing_id": "60c39900-94fe-420b-b997-60e9c64f3491",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "ベリー",
      "collector_number": "073",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
      "set_code": "neo1",
      "game_code": "pokemon",
      "variant_id": "c21bd7f6-d7e6-487c-ac76-00a7d218d95c",
      "finish_code": "normal",
      "printing_id": "60c39900-94fe-420b-b997-60e9c64f3491",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "ベリー",
      "collector_number": "073",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "56ae4a00-656c-4564-8d7a-831db2900857": {
    "alias": "074",
    "setCode": "neo1",
    "sourceCode": "scrydex",
    "provider": "neo1_ja-74",
    "row": "aba4cbda0278bae1fed4a888a3696ab7eec84123523c92d459088b5374397635",
    "peer": "ccb8a0d1af42ab678a2d9fc7fe3a07b97e2e94bb53817ff5c5b28249f2ef1365",
    "publicPeer": "2f8f830ca4358483e90d39bb84a9c38f4ff7008af8d481c51d8d43391dfe5fc4",
    "original": "b767880240a4bfb59ebdbb852f4856a340f4bcc272191ab5abd20a611c9af9f7",
    "metadata": "d1aef35dfd4554a3885a6ee8dff17f353b766f19817f063f3d661a68f59d4824",
    "identity": "f656037a606554f67e55a85204a72e771b81fa682164d96e13d02d4dbd55383e",
    "source": "f656037a606554f67e55a85204a72e771b81fa682164d96e13d02d4dbd55383e",
    "actual": "25cf54195a00a99bf84840ed4ba783f637622f32e904086e230d2ec308735e56",
    "observations": "0fb9a16f2bdc8b472ed48ba2b73766ab45de7159a6083bdf097cb4e6680b2c56",
    "publicObservations": "0fb9a16f2bdc8b472ed48ba2b73766ab45de7159a6083bdf097cb4e6680b2c56",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-74/large",
    "production": {
      "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
      "set_code": "neo1",
      "game_code": "pokemon",
      "variant_id": "0d21bd9d-f70f-4671-898f-278daad9cda2",
      "finish_code": "normal",
      "printing_id": "56ae4a00-656c-4564-8d7a-831db2900857",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "スーパーロッド",
      "collector_number": "074",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
      "set_code": "neo1",
      "game_code": "pokemon",
      "variant_id": "0d21bd9d-f70f-4671-898f-278daad9cda2",
      "finish_code": "normal",
      "printing_id": "56ae4a00-656c-4564-8d7a-831db2900857",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "スーパーロッド",
      "collector_number": "074",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "331a9eb6-75c4-47f1-97c8-ad2c55884ba3": {
    "alias": "075",
    "setCode": "neo1",
    "sourceCode": "scrydex",
    "provider": "neo1_ja-75",
    "row": "ac5512284c227ca6b38bc58e716cbc022ab671bd725b0b5de851b738d287c266",
    "peer": "dc0c1bb60de4a4e31403e20c397cd563f06dd48f9d1fa3aee3f6e8c91708498b",
    "publicPeer": "a6c787fbb3f75c9d41980e6471b9002add0a4d9906a25ef76bf22b7846ecff24",
    "original": "3fbf00ecdf7a6682fa29e2fe76cd705cec4cc3920977fb08f7c75f7d1a30a39c",
    "metadata": "aed837d6a352b7629ebd91875d751a4f275003b715695760876b8242abeb24ef",
    "identity": "33e19cf027ef8db9e4efa34286d08854e2fe37a560ce1ecd8fe33e303dcadd67",
    "source": "33e19cf027ef8db9e4efa34286d08854e2fe37a560ce1ecd8fe33e303dcadd67",
    "actual": "75d6e27f1fe0e710c44565d51a0db2cc923705bb0398c12ae0227889c8e7f7c0",
    "observations": "d3d8286947447eaa6edfa08477ed2de6ea989e973a6beb1d403eade5bc5121c8",
    "publicObservations": "d3d8286947447eaa6edfa08477ed2de6ea989e973a6beb1d403eade5bc5121c8",
    "imageUrl": "https://images.scrydex.com/pokemon/neo1_ja-75/large",
    "production": {
      "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
      "set_code": "neo1",
      "game_code": "pokemon",
      "variant_id": "8f29d59d-9dbf-4058-a9b1-17797791530f",
      "finish_code": "normal",
      "printing_id": "331a9eb6-75c4-47f1-97c8-ad2c55884ba3",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "二重突風",
      "collector_number": "075",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "769fa22e-e603-41a8-b62b-920a4abc660b",
      "set_code": "neo1",
      "game_code": "pokemon",
      "variant_id": "8f29d59d-9dbf-4058-a9b1-17797791530f",
      "finish_code": "normal",
      "printing_id": "331a9eb6-75c4-47f1-97c8-ad2c55884ba3",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "二重突風",
      "collector_number": "075",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "03b21683-af68-4f9a-bbbd-647dec3d5b81": {
    "alias": "053",
    "setCode": "neo2",
    "sourceCode": "scrydex",
    "provider": "neo2_ja-53",
    "row": "06f8a7c58fef51e6c3065b8fc2c83d7d9c57f5a566340a502e9377f4ab99d4be",
    "peer": "23466ddfc1097926b48c398e92a7e74ad72a44272803e664241e89be1fb49c7e",
    "publicPeer": "f36bcc27f2a9fc46ef81157826d3dfc54b58e7bd448f06b96a9a07cd44abefb2",
    "original": "19feecd0a5d0653c7c5656865600300f37d26470f872e89116206e539282e18d",
    "metadata": "cc39d30e68b00bd43ef251f3cce31f88bdbc7590d665311ea04ee3e1684e1a7c",
    "identity": "1efdcc9a21048e3a8234335e179b2d08863096ad922568ad28cbd9e5b165690d",
    "source": "1efdcc9a21048e3a8234335e179b2d08863096ad922568ad28cbd9e5b165690d",
    "actual": "68cf5a16e53631ad0f4840052c42807c40fcb030bb402c6859225ba8b0292446",
    "observations": "087b948c771d4db4c18134bb0147f99f72853e909f020ca7d996fb848226820b",
    "publicObservations": "087b948c771d4db4c18134bb0147f99f72853e909f020ca7d996fb848226820b",
    "imageUrl": "https://images.scrydex.com/pokemon/neo2_ja-53/large",
    "production": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "e0b949b2-2bc9-4aca-bdec-f1584ec3f011",
      "finish_code": "normal",
      "printing_id": "03b21683-af68-4f9a-bbbd-647dec3d5b81",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "エネルギーアーク",
      "collector_number": "053",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "e0b949b2-2bc9-4aca-bdec-f1584ec3f011",
      "finish_code": "normal",
      "printing_id": "03b21683-af68-4f9a-bbbd-647dec3d5b81",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "エネルギーアーク",
      "collector_number": "053",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "9815742c-ab9c-47d5-a05e-8fa67d755b43": {
    "alias": "054",
    "setCode": "neo2",
    "sourceCode": "pokellector",
    "provider": "39645",
    "row": "ec15c0ef7988ac468acc0fcf290966666849c713582e378e6de2a8c4f4e1d91e",
    "peer": "92d17a56e2dc006f1805d4ce41ba5e3daf8980907149f26929de179f1730c528",
    "publicPeer": "184c0b8f326be2d386100f7d1bbdd72eda1a5ccc32539caa18366e8d7caa8ea5",
    "original": "d5561d776619b453097fb25d53135c3d7ae4cece93c6abe8e0875b555e1e6a88",
    "metadata": "1654eb2fbb954141320f4fd4ace33265cbcb1388534c1947073278cedc99b866",
    "identity": "3cf12285c95b0c29ef04722752e2305480b2345bfc0851703c8224b1b8e751ae",
    "source": "3cf12285c95b0c29ef04722752e2305480b2345bfc0851703c8224b1b8e751ae",
    "actual": "41e2d82de1c7dd3f2dd6ccedcbde1bcae92227bc3312641a782a09cbd468013a",
    "observations": "9b6cdb98ea6ac8085f97225314fe101c4024ed8f860b0fff4898148b15f48c5d",
    "publicObservations": "9b6cdb98ea6ac8085f97225314fe101c4024ed8f860b0fff4898148b15f48c5d",
    "imageUrl": "https://den-cards.pokellector.com/331/Ruin-Wall-KabutoRuin-Wall-Aerodactyl.NEO2.54.39645.png",
    "production": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "e9c77163-1fa9-417f-ac99-caa57cce0533",
      "finish_code": "normal",
      "printing_id": "9815742c-ab9c-47d5-a05e-8fa67d755b43",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "壁を台無しにする[カブト]",
      "collector_number": "054",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "e9c77163-1fa9-417f-ac99-caa57cce0533",
      "finish_code": "normal",
      "printing_id": "9815742c-ab9c-47d5-a05e-8fa67d755b43",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "壁を台無しにする[カブト]",
      "collector_number": "054",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "be1af7b3-7199-445e-89e3-2ad26f93ffc7": {
    "alias": "055",
    "setCode": "neo2",
    "sourceCode": "scrydex",
    "provider": "neo2_ja-55",
    "row": "035e755c37dabe577ad01c69f6f83778bd7199181ed771b03bb8ca08fd8556bf",
    "peer": "f9a140258dedae61992c83ba6540e92e703c55ff69023c2414b1d6118ce527fa",
    "publicPeer": "2359ce2be3e532968fa133eb7b1c7751d654e950b553211847d7d2725992289e",
    "original": "093954beed912a12f4bbc2bd63601fa27123f780fa65321a032f4fe9207e9a47",
    "metadata": "c484fdbf7fc6f49b3fd513bf928b83152b1f9c304f9f2ac330adb7491dfa932b",
    "identity": "69a92db63fb211763ef518d52992b7e134a93df7c12d47e698993aa151291f6a",
    "source": "69a92db63fb211763ef518d52992b7e134a93df7c12d47e698993aa151291f6a",
    "actual": "4b55f356ef9179de09559da26274dea5973812469d3d5bbd49cce325dd4285c8",
    "observations": "32b47cb9630e1dfbbc83b9f5e8951cb8c1ad465e126e0da9d398812d61f02aa3",
    "publicObservations": "32b47cb9630e1dfbbc83b9f5e8951cb8c1ad465e126e0da9d398812d61f02aa3",
    "imageUrl": "https://images.scrydex.com/pokemon/neo2_ja-55/large",
    "production": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "33605fc7-7329-4191-ab47-25a8b8dfedc4",
      "finish_code": "normal",
      "printing_id": "be1af7b3-7199-445e-89e3-2ad26f93ffc7",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "化石卵",
      "collector_number": "055",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "33605fc7-7329-4191-ab47-25a8b8dfedc4",
      "finish_code": "normal",
      "printing_id": "be1af7b3-7199-445e-89e3-2ad26f93ffc7",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "化石卵",
      "collector_number": "055",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "34a5728e-9e47-453f-8102-84259c8cdaf2": {
    "alias": "056",
    "setCode": "neo2",
    "sourceCode": "scrydex",
    "provider": "neo2_ja-56",
    "row": "66aef82f035db1d760c361c27587c34fdc12708029f8cc129e2b6fbf9aef4607",
    "peer": "e8ee7748da78c0fbf973e2c00f44c58a169a29df54e58ede88edb87aa0ad8fc1",
    "publicPeer": "750407967bbf5f820d0b66abb58a62dd7b81733fcdf3fa26a09afbbd783a65e6",
    "original": "3def2fa5637f88174f9e82193707a3f247595d1336b3330c30669781f830730c",
    "metadata": "9ad9bdd68adfd48811634f2b3daea5e5faf9ce9dd91314052bf7556696ecaeac",
    "identity": "352a71f436514be3ce266e70661182467ad19681e5f865d37fc82a66fdc6b1c8",
    "source": "352a71f436514be3ce266e70661182467ad19681e5f865d37fc82a66fdc6b1c8",
    "actual": "f3b9d497256cbe18812ad8375466382ec2ba0c2e31688b2ed621f01beb5a518e",
    "observations": "8e96f28df5ee54389941ec44f95129f6bdcf3997c86bc6430b1d687a3869d94b",
    "publicObservations": "8e96f28df5ee54389941ec44f95129f6bdcf3997c86bc6430b1d687a3869d94b",
    "imageUrl": "https://images.scrydex.com/pokemon/neo2_ja-56/large",
    "production": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "9de3a61b-28c7-4cfa-8167-2ee54b2f62e4",
      "finish_code": "normal",
      "printing_id": "34a5728e-9e47-453f-8102-84259c8cdaf2",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "ハイパーデボルブスプレー",
      "collector_number": "056",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "9de3a61b-28c7-4cfa-8167-2ee54b2f62e4",
      "finish_code": "normal",
      "printing_id": "34a5728e-9e47-453f-8102-84259c8cdaf2",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "ハイパーデボルブスプレー",
      "collector_number": "056",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  },
  "4ec6bdf6-3a65-4dd6-a3d7-84ea96cb77d6": {
    "alias": "057",
    "setCode": "neo2",
    "sourceCode": "pokellector",
    "provider": "39648",
    "row": "2de09ddc7f8ba2fbdd3b505cf2b6aac496baed3c892e3297e20b31271b43527f",
    "peer": "dea25852cecedf72b7b0af8186ad82140b569c5f2044863e075ff0ec4d5d5dd0",
    "publicPeer": "20753d222e8ca42e54516c39ee01e37a2fd0daa05d4af8670f7918f1ffe90837",
    "original": "f00804e6b093b5d9028cb1f5692d939195d41cbb6a5bdcef1fe5d3bfed9d43c4",
    "metadata": "e1291b92080541958013ff0681e81ae4bb4df34eefd938854f8b957ac37481cb",
    "identity": "af562cf8de95cba61b177524f8c23cac1276f5cce0861b4d551d0fcca634e50c",
    "source": "af562cf8de95cba61b177524f8c23cac1276f5cce0861b4d551d0fcca634e50c",
    "actual": "df4def6a0cce1707d322e0441dc87026c44e69c98000f2c81f187baadde8a362",
    "observations": "6718ceb487799029b4ff42b94d676af2c865cf36288f38b3be74e5de6aabb6c4",
    "publicObservations": "6718ceb487799029b4ff42b94d676af2c865cf36288f38b3be74e5de6aabb6c4",
    "imageUrl": "https://den-cards.pokellector.com/331/Ruin-Wall-Kabuto.NEO2.54.39648.mobile.jpg",
    "production": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "a4b5fd43-f9f0-494f-8fc8-e1dcc7398386",
      "finish_code": "normal",
      "printing_id": "4ec6bdf6-3a65-4dd6-a3d7-84ea96cb77d6",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "壁を台無しにする[aerodactyl]",
      "collector_number": "057",
      "catalogue_version_id": "1a23b7a7-c50e-4601-9180-a25c950d27ea",
      "same_artwork_as_variant_id": null
    },
    "staging": {
      "set_id": "e60f305b-5ad6-4964-b6c6-636788481ca5",
      "set_code": "neo2",
      "game_code": "pokemon",
      "variant_id": "a4b5fd43-f9f0-494f-8fc8-e1dcc7398386",
      "finish_code": "normal",
      "printing_id": "4ec6bdf6-3a65-4dd6-a3d7-84ea96cb77d6",
      "variant_code": "normal",
      "language_code": "ja",
      "card_native_name": "壁を台無しにする[aerodactyl]",
      "collector_number": "057",
      "catalogue_version_id": "d560cd01-de2a-4713-9518-b967fb4c5ac9",
      "same_artwork_as_variant_id": null
    }
  }
}; // Populated offline from root's immutable accepted eight.
const privateKeys = new Set(['path', 'absolutePath', 'rawPath', 'receiptPath', 'originalPath', 'independentSelectionFile', 'independentReviewFile']);
const commercialKeys = new Set(['pricing', 'prices', 'marketplaces', 'pop_reports', 'provider_metadata']);

export function publicProjection(value) {
  if (Array.isArray(value)) return value.map(publicProjection);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key, nested]) => {
    if (privateKeys.has(key) && typeof nested === 'string' && /^[A-Za-z]:[\\/]/u.test(nested)) return false;
    check(!commercialKeys.has(key), 'Full commercial source fields belong offline');
    return true;
  }).map(([key, nested]) => [key, publicProjection(nested)]));
  check(typeof value !== 'string' || !/(?:^|\s)[A-Za-z]:[\\/]/u.test(value), 'Private filesystem path in public body');
  return value;
}
export const publicationBody = body => publicProjection(body);
export function knownSource(printing) { const known = expectedRows[printing]; check(known, 'Outside exact accepted eight'); return known; }

export function validateActual(actual, known) {
  check(canonicalHash(actual) === known.actual, 'Exact accepted native Trainer body/artist changed');
  check(actual.header === 'TRAINER' && actual.nationalDex === null && actual.hp === null && actual.printedCollectorNumber === null && actual.printedNumberIsNationalDex === false, 'Unnumbered Trainer must not borrow Pokemon/Dex/collector fields');
  if (known.setCode === 'neo1') {
    check(actual.category === 'Trainer' && actual.language === 'ja' && actual.canonicalAliasIsPrintedNumber === false && actual.pokemonFieldsNotApplicable === true && actual.pokemonStage === null && actual.retreatCost === null && same(actual.pokemonTypes, []) && same(actual.orderedAttacks, []), 'Exact Neo1 Trainer category witness required');
    check(actual.nativeTitle && actual.printedEffect && actual.setMark, 'Complete native Neo1 effect/set witness required');
    if (known.alias === '073') check(actual.artist === null && actual.artistReadCertain === false && actual.artistFullPrintedCredit === null && actual.artistVisibleCreditFragments.includes('/CR CG gangs') && actual.artistQualification, 'Only073 qualified optical null artist accepted');
    else check(actual.artistFullPrintedCredit, 'Complete printed credit required');
  } else {
    check(actual.actualLanguageCode === 'ja' && actual.canonicalCollectorAliasNotPrintedNumber === true && actual.stage === null && actual.evolvesFrom === null && actual.printedDexNumber === null && actual.retreatSymbols === null, 'Positive Neo2 unnumbered Trainer witness required');
    for (const key of ['orderedAttackNames', 'orderedAttackCosts', 'orderedAttackDamage', 'abilityNames', 'nativeAttackText']) check(same(actual[key], []), `Borrowed Pokemon attack: ${key}`);
    check(actual.originalSha256 === known.original && actual.artistReadCertain === true && actual.artist && actual.nativeRules.length > 0 && actual.nativeRulesText === actual.nativeRules.join('\n') && actual.fullCardFrontVisible === true && actual.allFourOuterEdgesVisible === true && actual.setSymbolObserved === true, 'Complete accepted Trainer frame/native rules required');
  }
}

export function validateSourceRow(raw, peer) {
  const known = knownSource(raw.printingId);
  check(canonicalHash(raw) === known.row && canonicalHash(peer) === known.peer, 'Pinned root projection or unchanged independent peer row changed');
  check(raw.independentSelectionRowCanonicalJsonSha256 === known.peer && raw.selectedSourceCode === known.sourceCode && raw.rootAcceptedSourceCode === known.sourceCode && raw.selectedSourceCardId === known.provider && raw.approvedSourceCardId === known.provider, 'Cross-provider or unapproved source binding');
  check(raw.original.sha256 === known.original && canonicalHash(raw.sourceIdentityProjection) === known.identity && canonicalHash(raw.sourceSignature) === known.source && canonicalHash(raw.acceptedPixelObservations) === known.observations, 'Raw source/identity/observation drift');
  check(same(raw.currentProduction, known.production) && same(raw.currentStaging, known.staging), 'Current exact tuple drift');
  validateActual(raw.acceptedActualPixelSignature, known);
  check(raw.eligibleForFinitePreparation === true && raw.exactArtworkSourceIdentityAccepted === true, 'Positive finite source acceptance required');
  return known;
}

export function projectSourceBody(raw, peer) {
  const known = validateSourceRow(raw, peer);
  const selection = publicProjection(peer);
  return {
    contract: 'stackr-ja-legacy-trainer8-identity-v1', accepted_category: 'Trainer',
    provider_code: known.sourceCode,
    provider_metadata_format: raw.sourceMetadataFormat ?? 'scrydex_raw_html_private_full_card_and_safe_identity_projection',
    provider_metadata_raw_html_sha256: raw.sourceRawHtml.sha256,
    provider_metadata_full_captured_json_sha256: raw.sourceFullCapturedJsonFileSha256 ?? null,
    provider_metadata_full_captured_json_canonical_sha256: raw.sourceFullCapturedJsonCanonicalSha256 ?? null,
    provider_metadata_identity_projection: raw.sourceIdentityProjection,
    provider_metadata_identity_projection_sha256: known.identity,
    identity_projection_contract: 'Exact retained identity-key whitelist; variants[name,images]. Raw HTML bytes, private full JSON file/canonical hashes and this derived identity projection are separate contracts. Pokellector photo identity is not Scrydex metadata.',
    supporting_native_metadata_only: raw.supportingNativeMetadataOnly ? publicProjection(raw.supportingNativeMetadataOnly) : null,
    source_signature: raw.sourceSignature, source_signature_sha256: known.source,
    actual_pixel_signature: raw.acceptedActualPixelSignature, actual_pixel_signature_sha256: known.actual,
    historical_actual_pixel_signature: raw.historicalActualPixelSignature ?? null,
    historical_actual_pixel_signature_sha256: raw.historicalActualPixelSignatureSha256 ?? null,
    historical_source_handoff_row_canonical_json_sha256: raw.historicalSourceHandoffRowCanonicalJsonSha256 ?? raw.historicalMetadataRowCanonicalJsonSha256 ?? null,
    historical_selected_source_card_id: raw.historicalSelectedSourceCardId ?? raw.historicalProposalSelectedSourceCardId ?? null,
    historical_holds: publicProjection(raw.historicalHolds ?? raw.historicalHold ?? null),
    approved_projection_row_canonical_json_sha256: known.row,
    independent_selection: selection,
    independent_selection_raw_canonical_json_sha256: known.peer,
    independent_selection_public_canonical_json_sha256: canonicalHash(selection),
    public_projection_contract: 'Remove only named absolute private path fields. Relative evidence references and all historical claims remain; no private full provider JSON or commercial data is included.',
    pixel_observations: publicProjection(raw.acceptedPixelObservations),
    pixel_observations_raw_canonical_json_sha256: known.observations,
    pixel_observations_public_canonical_json_sha256: canonicalHash(publicProjection(raw.acceptedPixelObservations)),
    provider_discrepancies_retained: publicProjection(raw.sourceProviderDiscrepanciesRetained ?? []),
    current_acceptance: { independently_accepted: true, source_code: known.sourceCode, source_card_id: known.provider, original_sha256: known.original, category: 'Trainer' },
    source_variant_support: { currentFinishCode: 'normal', physicalFinishVerified: false },
    canonical_alias_not_used_as_printed_number: true,
    generic_other_rows_may_relax: false, physical_edition_verified: false, physical_finish_verified: false,
    vendor_licence_verified: false, sourcewide_approval: false,
  };
}

export function validatePublishedWitness(body, row) {
  const known = knownSource(row.printing_id);
  publicProjection(body);
  check(body.contract === 'stackr-ja-legacy-trainer8-identity-v1' && body.accepted_category === 'Trainer' && body.provider_code === known.sourceCode && row.source_code === known.sourceCode && row.provider_id === known.provider && row.image_url === known.imageUrl, 'Exact production provider/photo identity changed');
  check(body.approved_projection_row_canonical_json_sha256 === known.row && body.independent_selection_raw_canonical_json_sha256 === known.peer && canonicalHash(body.independent_selection) === known.publicPeer && body.independent_selection_public_canonical_json_sha256 === known.publicPeer, 'Private/raw versus public peer projection changed');
  check(body.actual_pixel_signature_sha256 === known.actual && body.source_signature_sha256 === known.source && canonicalHash(body.source_signature) === known.source && body.provider_metadata_identity_projection_sha256 === known.identity && canonicalHash(body.provider_metadata_identity_projection) === known.identity && body.provider_metadata_raw_html_sha256 === known.metadata, 'Exact source metadata/actual signature changed');
  check(body.pixel_observations_raw_canonical_json_sha256 === known.observations && body.pixel_observations_public_canonical_json_sha256 === known.publicObservations && canonicalHash(body.pixel_observations) === known.publicObservations, 'Accepted full art/frame observations changed');
  validateActual(body.actual_pixel_signature, known);
  if (known.sourceCode === 'pokellector') check(body.provider_metadata_full_captured_json_sha256 === null && body.provider_metadata_identity_projection.sourcePhotoId === known.provider && body.provider_metadata_identity_projection.literalImageUrl === known.imageUrl && body.supporting_native_metadata_only.sourceImageNotSelected === true, 'Wall photo metadata must remain separate from supporting Scrydex body');
  return known;
}

export function projectQueueControls(raw) {
  const known = knownSource(raw.printingId);
  validateActual(raw.acceptedActualPixelSignature, known);
  return {
    canonicalAliasIsInternalOnly: true, japaneseTrainerFullFrontVerified: true,
    qa: { japaneseNativeTitleVerified: true, japaneseFullNativeBodyVerified: true, exactTrainerArtAndReferenceVerified: true, printedCollectorNumberPresent: false, printedNationalDexPresent: false, pokemonFieldsAbsentFromActualPixels: true },
    guards: { fullFrameVerified: true, japaneseTitleAndFullBodyVerified: true, exactSourceOriginalVerified: true, independentExactArtworkReferenceVerified: true, collectorAliasNotPrintedNumber: true },
    pixel_qa: { actualSourcePixelsReviewed: true, fullNativeTrainerBodyVerified: true, fullArtSetMarkAndArtistAreaVerified: true, printedNumberOpticallyVerified: false, printedNumberVerified: false, printedNationalDexVerified: false, borrowedPokemonFields: false },
  };
}
