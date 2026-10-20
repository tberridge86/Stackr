// Exact MC8 source identity only. This private module cannot authorise publication.
import {createHash} from 'node:crypto';
const check=(ok,message)=>{if(!ok)throw Error(message);};
const sorted=value=>Array.isArray(value)?value.map(sorted):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(sorted(value))).digest('hex');
const expectedRows = {
  "7b1cc2c4-1540-4d78-880b-4e10a0331397": {
    "alias": "GRA",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:6cc623d466eac9417fc28cb3b861b4c4e5ec1fcf0eac4169f99c24e0a5aefd43",
    "imageUrl": "https://static.tcgcollector.com/content/images/3a/2d/21/3a2d214c2084f1a5b9934b3c7a0dde4ea8f2519624f463936f7a6f249bf423ee.webp",
    "row": "9353e37cc71d48ff53006cd1b1fe9da0e859a4a8e1c409e7c02b51a04fdfd1b2",
    "peer": "2381dbb8e82f92a3c8dccfae48616b927a34a0459449a8c3f1718fdb819cc5d3",
    "actual": "5c26fc328a4f4c0b2718e21aed9b19271c383682b9e07a32064b0b8c7f010d1e",
    "publicPeer": "4a72876306e0ce60526f69617d527359d9a7f46a4f36e9345c061a5fc5ac3b2e",
    "original": "022d647dc7d68bfff87d168cce25a84f1a754104b7ff3f499567ca5a022ac3eb",
    "bytes": 55032,
    "width": 868,
    "height": 1212,
    "productionBinding": "5d3d3fa77d07990e331814687a3d237917f74fb23049ce034616c2804286570a",
    "stagingBinding": "1eaea7a4624750eb653f7f802029e63d231a5519c029081f9087153fd2b32041",
    "photo": "074305109098bd7082a5a6eedfb1891cf5b2b7ae40b21788edb0819a0a3d2a24",
    "body": "e3f46195acebcb2a867bbb4d3ca9fa5b1b7d484af251a86c6dc5fc2c6ab444b9",
    "controls": "cf5ef9a881b627944363e39dc69393dea79cd7965c072652b19cc71158a883ba"
  },
  "16ddfe56-d4f2-4bbe-93fe-bc33e2ba46fd": {
    "alias": "FIR",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:a9f726bbdc3d720a84e6670d7eb211fff8497d1c6c950172793697ef0a3becf0",
    "imageUrl": "https://static.tcgcollector.com/content/images/f4/97/aa/f497aaed813e3abda973c63027e95165ecc72eb06673c098c0e6b3cb088c5f11.webp",
    "row": "e1b1ae222660040aa37bf750659b04d7f8296c20f4349e66725fa42ba4b439e8",
    "peer": "a6edc42a22207a22d40cf3694ff21b07b53ad910d60b76be9b1eb0b454b1d504",
    "actual": "0d55f7e4f106b4491b7d4b5b45bf6e54d868cb5c58a3d82d7bf79e66c4c93cf3",
    "publicPeer": "a5f453864154f5a47977052d485242e463e611bdaa17f3fe040ec64012b5aa18",
    "original": "a2fc2bc3fb09a28e259c323304e30213b0f5933b0114719623776685c4e88383",
    "bytes": 57696,
    "width": 868,
    "height": 1212,
    "productionBinding": "96ee6923bf47d3e3fe30499d33a944d97ca3ed213e53cbd92c170c70603d4dd8",
    "stagingBinding": "2b864f5f5b1db754f50b6b7cccfb9060aa649f57e148d30f88e370aacd3f8590",
    "photo": "44791fe5cbff02dc92f84d700172796cc6eca48927fadca8602b0c499046e37a",
    "body": "ce73ef44c1c1b2f2437877665caa23d3fbc57d68c0231201d5e3dfa93374cee1",
    "controls": "e8bb6d96e22dc69eb1705c268e0b4406c436bff6f2a8cafa99caad1fac540b8f"
  },
  "e366fc5e-deec-4863-bd5c-cc890adfbc08": {
    "alias": "WAT",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:74b014fc2fb490c80cbd93e4ee250bd8c026dfa743b5eb627ae5a8e858a5d061",
    "imageUrl": "https://static.tcgcollector.com/content/images/c4/79/a3/c479a31dce405c352f2571f6a3291c6b62904721ac37750a100949c45e07b669.webp",
    "row": "7ad22c755426e824e64fe469188b543d664eb5e480ec3ab5bd7667d56b60ffc3",
    "peer": "93946edcbdc417eca8b81ff8b71a62583fc6efe3fbc442708983c762db911eb6",
    "actual": "143ff67acc0416f7e0a52f04820bd21ce6ee624eb6646c23f19ff4c4fd709308",
    "publicPeer": "720ed21fc453527e72b738c748174a676c5b3b7f1b41a33fe56cc0b200c5f805",
    "original": "1379a845a194f6ba41712f2f84f26c41858e75d8e7b22da3f47a2314a9ff4fe6",
    "bytes": 53920,
    "width": 868,
    "height": 1212,
    "productionBinding": "b33c9575610e71338322d4a6805d1f0deebb4a3df331ff39c63c388dd1966079",
    "stagingBinding": "f024f553b4d15268feb3b02a8a9b2ead09c5da9fc070e2821e5010d87cf47bdb",
    "photo": "754459bd54a605ef23d9110f2e01680355a2b90c83d60ff37367875356477a35",
    "body": "1dfc168c4c571c75445d63dccbe8f045ba7ffa75e71b3f61ace755fe99a2690a",
    "controls": "3653f4d63a4c5c26e94594602e43894555c1c3912ba9a1de96560ed8a4fd9954"
  },
  "85321449-d93a-49a2-86a0-611d7b7b3e8e": {
    "alias": "LIG",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:c22d729db0e49828966e36bfe3fb046b2e30a380f304ca69ed301e0feb432d85",
    "imageUrl": "https://static.tcgcollector.com/content/images/92/87/b5/9287b537edd6e48bb169a0a349439c5fb3f0d9e346069ef96bbee453ca9626d4.webp",
    "row": "390c54709dc8fe87739ae4a347febeb82da07ea0307b6de1a7ba983a334855b7",
    "peer": "4435b18b090204bd1639a46c30bb5dcb1fec30d5814faefb8bc8f36bb183b469",
    "actual": "747cfff49a65c2f0fe8ecd6266329c0ec4c23b27d8c1cf601d2bc26d7ef1cd5c",
    "publicPeer": "f7a0c30b98dd06240e739f821ab31271ee5b2bc173d4a6de8802afae2493fcb5",
    "original": "f59bf4573265b1fb0e80be1737e9acbad79014bd9f04b9305b6fffbb6391974e",
    "bytes": 48652,
    "width": 868,
    "height": 1212,
    "productionBinding": "8a7867d127a7982645d6ab886d780d29051ae265c111d5f9d9a1dcaa14b90eb2",
    "stagingBinding": "9f350bfd126af961d189cf048bbec12d391b8f7ce81a1f8d7bf6b0859ffa3fb6",
    "photo": "041485dff3d053242a9919871f62bf438da615b8810dc0ad544b5e6c368cb610",
    "body": "aed58971651837538d2a7dde1728090b1c9425ea4f92cc4c334c9f14ff5b1a29",
    "controls": "ebd782b4023a6e481bb7f1298cc0519dd1d2ba27ff8b0c4705b6f6ff6d6bddd8"
  },
  "07ff7f6b-9459-4feb-bb0f-a0efd42079e5": {
    "alias": "PSY",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:ae7364f22a8c46d11d4d06b04dd84664347687de643202aaeaeccdd3e422dd95",
    "imageUrl": "https://static.tcgcollector.com/content/images/90/54/e0/9054e0755036ab864e3ed4c9ec6a3540c3112a2515ef3db4355cf24750568b75.webp",
    "row": "e4cb214cc031a798e112f087ed7a3ddbaec7fee32ab40bcb54f8d12d2e107777",
    "peer": "6f284f0d1d464de0cb48a30e8d69017ffa109479178fdf571c0e321ced495b38",
    "actual": "be1ea4a539a24d15496aa60b234acf2d964b8f115972d24c60527ba686f030f0",
    "publicPeer": "54a01d619aacc96e2cf35e6697eea46f84f781c5bb7285817fdbe555b8909e6c",
    "original": "a6de1a07bdda1b0fd8e774868a02ab17804985ed17bae3f568ab9846cd1d3876",
    "bytes": 51124,
    "width": 868,
    "height": 1212,
    "productionBinding": "7f3e6b3b3706baa0cce96d8f2575222bfb01cb207631bb09fb85fe9f52e07a4d",
    "stagingBinding": "d0f9a0c439cea8eed0ba73a2f254b6b1312ab59a6c4676806ae0a0b493fba560",
    "photo": "997fecdf0affa8e5d42e926338f650732ecd57c2cbba1cd24ec0cb082126217c",
    "body": "4eade9b530cbaca8d9bf14d7a4674d2acf321b34fa4f26ee9fd0f07256e191aa",
    "controls": "f59fa3fcebb838548f098efda472382bb5715c8cf1aaa3e5e988b9e72d6c978b"
  },
  "78343d26-d54b-40df-9d6f-d883c74c71cd": {
    "alias": "FIG",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:0c7d6123f4cc13b0c7c22ca3c4f379d0f68f3ec4f850526469295d3e71ab7bf8",
    "imageUrl": "https://static.tcgcollector.com/content/images/c0/09/fa/c009fa6edcdcf236fa8fd37af192a0e7afb752dedf04661f23ec99791c909f05.webp",
    "row": "9f979487f05f6bba7c37350eab83fc8347f9dadb5dab0899f60611a925266d87",
    "peer": "2180c12dafba3d2d2df93779f8aaaef556bbce60c0891ef53fd71fdc4f29a68a",
    "actual": "858f815bc5fe35b8f87ca27673b7ce287d7912d1fbedc2bdde203eac5e3a1a08",
    "publicPeer": "9d0f51ce9dc95f12f25dba3df1c64d237a1c8194195e49d066f1288c8f9318ed",
    "original": "241425bb8a572e619ec1cbdb2828fe72e0d877847eb1e6f3287ad0529b2d23c3",
    "bytes": 50454,
    "width": 868,
    "height": 1212,
    "productionBinding": "7b4a49fa24f934e3a9bfa131da9da2fa41034f2e48fec2856af1811a1c9848c7",
    "stagingBinding": "05ac6d5d0566b0a2ace5138f327c0807f1969382ae0f88da330cb06ba306d053",
    "photo": "0030fcb96dc68261628fbf2b66760947d3433e5c3f73e9db1aeca5f6d6cabc69",
    "body": "1db7dd6c6e38b1ce97b37575238d4b9822b98a6aa8157aff40b5b8939df2481b",
    "controls": "6d112bb098f9c36cad062b53c868f14705cb7a396f752ca749efaf7ea499999c"
  },
  "e830100c-dc89-403f-aa16-994b4b1b8cb9": {
    "alias": "DAR",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:57ce71bb47db3d7bff6a5327ca93b8b7bf297c56ae0473f1e5cccc98f49c5a61",
    "imageUrl": "https://static.tcgcollector.com/content/images/06/91/51/0691516890eda2d682b3502b19c672eca3d8ddf1952ea29560d1098a18ebfa74.webp",
    "row": "7c4a6ceca544b9fdef3cde379759e9c405f38ff8a2d37f71bcb738c8811555c2",
    "peer": "f76ccb44ff43ebdb15dc2065fbdf3014ebc6a773216024c2467dc5ecb3047329",
    "actual": "c6d4cdd565ce59f51f4675763b2b5ab60d9f45e494eecaaf502c97f1e086d026",
    "publicPeer": "c3a7e06d0a93bb0d3bd44cbda17374dc84bca2d46b404a3b30f71fa0129702cb",
    "original": "e1484f6fc27e2ca486af21a5219a847102ef8bdb3f419f307444b4eeaec4e0b4",
    "bytes": 51400,
    "width": 868,
    "height": 1212,
    "productionBinding": "2b340aba0316c76e81d080e56e6cc2ce46bb0548539bdcb25ebd4013e47e7a9e",
    "stagingBinding": "41b334524ca08a76c273eb411aa4ed4f66e0723fd4dcf043db4ec2763bd995a4",
    "photo": "34e26740d087a9103a3ed92f12a724439df50ee7f1681afec6f7046529c0c4be",
    "body": "e34e4146c42f85ca9a1ecdf17a06b95ea7d27b805f3abdb45efacf5e925d1bc6",
    "controls": "6994ad45a0b02f38e8da81678c5256ecece7320eea78b385390f7c0215e14ba3"
  },
  "322b5ba7-8a5d-418d-8abd-376a12d3dea9": {
    "alias": "MET",
    "category": "Energy",
    "provider": "tcgcollector-image-url-sha256:d1236e8ebb0e0945a3db682a1c56e6dfc9ebf34799e465922b279a4e6f17ccaa",
    "imageUrl": "https://static.tcgcollector.com/content/images/44/fc/59/44fc593e3141734d92d78d30d9aa3f03b475b00732ae082fbbb6ff87b3bd4022.webp",
    "row": "77ef2d6551abce1faa95088988834d58505c2dfb8b8bfb42699ba5e2ee5129db",
    "peer": "d9c64da28a0759b78e754b1bb9598013873f1e1fce81f9b9ba12ee60f659ff78",
    "actual": "7f39e48b8eb57477f90a78e7a79d0030fc17cd0ada569c5ba10f51ee4863d8a5",
    "publicPeer": "1c0fc49f28500d7535a4bd278a50d0653272f739ccd072cc99a614b872da9cd7",
    "original": "1c92c9e66a140dcdaa6a4de04fdfc28791c7ff48f1172fdedff4718b2fdf3a88",
    "bytes": 43436,
    "width": 868,
    "height": 1212,
    "productionBinding": "95e4cc3bd89c9651a2195f7ac7d616c95709de6826bf6b3cc252de577177b77d",
    "stagingBinding": "c62b06fa421962fdfa1985a5f5afff6c4dbaed2409beb1932a3a32db4ebba0b4",
    "photo": "68c2ad9dae802063adea5e320c6b1887b174b414fa82776036a5d3f3b4be57d7",
    "body": "eb2ec15ebe2aff857c0b0a6bad35e1f048963418ec743d14b16ab9c6140be6b1",
    "controls": "d9ffd02fb9c8a8b9e30d6d4f55701b379285e8ef5dc964f68923e76764bc861d"
  }
};
export const REQUIRED_FRESH_CHECKPOINT_BEFORE_FREEZE = true;
export const REQUIRED_PRIOR_VERIFIED_RUN = 38798480441;
export function requireFinalPublicationFreeze(plan){
 check(plan && plan.source_policy_checkpoint_sha256==='9fed86a8de20b4229f20cd0a91b617cb8e44b7e83623fd2939a6ab068e1c9228' && plan.publication_supplement_sha256==='597c96b61f46d45dcefacde19856c5659c65465dcad1b2b0b59a075e2ccef46a','Fresh verified three-source checkpoint and root supplement required');
 check(plan.publication_conditions_satisfied===true && plan.prior_verified_production_run===38798480441 && plan.maximum_new_production_sources===0,'Conditional publication authority not satisfied');
 check(canonicalHash(plan.existing_source_row_hashes)==='e685170181cb55aa5b676d0f84b33d13715125cf3d09fe1ae54d89371270f858','Exact full17 three-source hashes required');
}

export function publicProjection(value){
 if(Array.isArray(value))return value.map(publicProjection);
 if(value&&typeof value==='object'){for(const key of Object.keys(value))check(!['pricing','prices','marketplaces','pop_reports','privateDecodedMetadata'].includes(key),'Private commercial metadata');return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,publicProjection(item)]));}
 check(typeof value!=='string'||!/(?:^|\s)[A-Za-z]:[\\/]|file:\/\//u.test(value),'Private path');return value;
}
export const publicationBody=publicProjection;
export function knownSource(id){const row=expectedRows[id];check(row,'Outside exact MC8');return row;}
export function validateActual(actual,known){
 check(canonicalHash(actual)===known.actual,'Accepted Energy signature changed');
 check(actual.category==='Energy'&&actual.language==='ja'&&actual.printedHeaderLeft==='基本エネルギー'&&actual.printedHeaderRight==='エネルギー','Positive Japanese Basic Energy headers required');
 check(actual.printedSetCode==='MC'&&actual.printedFooterReference===known.alias&&actual.canonicalReferenceMatchesPrintedTypeCode===true&&actual.printedTitleUsesTypeGlyphRatherThanWrittenKanji===true&&actual.titleSemanticNameIsVerbatimPrintedKanji===false,'Actual MC/type footer and glyph semantics required');
 check(actual.printedCollectorNumber===null&&actual.printedNumericCollectorNumber===null&&actual.printedNationalDex===null&&actual.printedNumberIsNationalDex===false&&actual.hp===null&&actual.stage===null&&actual.retreat===null&&actual.artist===null&&actual.nativeRules===null&&actual.attacks.length===0&&actual.abilities.length===0,'Energy cannot borrow Pokemon, Trainer, artist or numeric identity fields');
 check(actual.completeCardFrameVisible===true&&actual.allFourOuterEdgesAndCornersVisible===true&&actual.copyrightYear===2025&&actual.physicalFinishVerified===false&&actual.physicalEditionVerified===false,'Complete actual Energy frame/qualifications required');
}
export function validateSourceRow(raw,peer){
 const known=knownSource(raw.printingId);check(canonicalHash(raw)===known.row&&canonicalHash(peer)===known.peer,'Root/peer source row changed');
 check(raw.sourceCode==='tcgcollector'&&raw.selectedSourceCardId===known.provider&&raw.sourceImageUrl===known.imageUrl&&known.provider==='tcgcollector-image-url-sha256:'+createHash('sha256').update(known.imageUrl).digest('hex'),'Literal TCGCollector photo changed');
 check(raw.rootFiniteSourceEligibilityAccepted===true&&raw.publisherFreezeRequiresFreshThreeSourceCheckpoint===true&&raw.preparationApproved===true&&raw.publicationApproved===true,'Finite preparation with pending checkpoint is mandatory');
 check(peer.preparationApproved===false&&peer.publicationApproved===false&&raw.historicalSelectedSourceCardId===null,'Historical source-only approvals must stay separate');
 check(raw.original.sha256===known.original&&raw.original.bytes===known.bytes&&raw.original.format==='WEBP'&&raw.original.mime==='image/webp'&&raw.original.width===868&&raw.original.height===1212,'Original HD pixels changed');
 check(canonicalHash(raw.currentProductionBinding)===known.productionBinding&&canonicalHash(raw.currentStagingBinding)===known.stagingBinding&&raw.eligibleVariantIds.length===1,'Exact environment tuples changed');
 check(canonicalHash(raw.safePhotoIdentityProjection)===known.photo&&canonicalHash(raw.acceptedPeerPublicProjection)===known.publicPeer,'Safe photo/peer projection changed');validateActual(raw.acceptedActualPixelSignature,known);return known;
}
export function projectSourceBody(raw,peer,body){const known=validateSourceRow(raw,peer);publicProjection(body);check(canonicalHash(body)===known.body,'Exact private-preparation public body changed');return body;}
export function projectQueueControls(raw,controls){const known=knownSource(raw.printingId);validateActual(raw.acceptedActualPixelSignature,known);check(canonicalHash(controls)===known.controls,'Exact Energy/footer QA changed');return controls;}
export function validatePublishedWitness(body,row){const known=knownSource(row.printing_id);publicProjection(body);check(canonicalHash(body)===known.body,'Exact MC8 source body changed');validateActual(body.actual_pixel_signature,known);check(body.publication_gate.required_fresh_three_source_checkpoint_before_freeze===true&&body.publication_gate.production_ready===false&&body.publication_gate.fresh_checkpoint_bound_by_this_private_package===false,'Private archive cannot establish publication readiness');return known;}
