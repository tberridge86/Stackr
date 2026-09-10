import { readFile } from 'node:fs/promises';
function partitionSql(template, batch) {
 const digit=parseInt(batch.partition,16);
 const lower=batch.partition+'0000000-0000-0000-0000-000000000000';
 const upper=digit===15?null:(digit+1).toString(16)+'0000000-0000-0000-0000-000000000000';
 return template
 .replace("where a.asset_type='card_image'",()=>`where a.id>='${lower}'::uuid ${upper?`and a.id<'${upper}'::uuid`:''}\n and a.asset_type='card_image'`)
 .replace("statement_timeout='90s'","statement_timeout='45s'")
 .replace("e.n=5271",()=>`e.n=${batch.variants}`)
 .replace("e.unique_variants=5271",()=>`e.unique_variants=${batch.variants}`)
 .replace("e.digest='34794a13e68b519ec28d6638a55600986db396c11672cfbcaaa5ae034ce723db'",()=>`e.digest='${batch.digest}'`)
 .replace("modified_count<>5271",()=>`modified_count<>${batch.variants}`)
 .replace("audit_count<>5271",()=>`audit_count<>${batch.variants}`)
 .replace("log_count<>5271",()=>`log_count<>${batch.variants}`);
}
export { partitionSql };
export const partitions=[
  {
    "partition": "0",
    "variants": 55,
    "digest": "b207b3791a75e609ab63c2574a4ae0a7e2ccc2f65f7d5f4dac62d48a1f557557"
  },
  {
    "partition": "1",
    "variants": 81,
    "digest": "95fa781b88e8b4e33cb9e4b6d9ca1b8405c2ee86a864bfd909f0df03deed67ba"
  },
  {
    "partition": "2",
    "variants": 148,
    "digest": "63ecad12473ebb759235905c89febe14b5b979cb14a03f1c074e4a3747a11624"
  },
  {
    "partition": "3",
    "variants": 168,
    "digest": "3c3cc2b933b831f4e5eecdd35853875f0e35cdee4075087a1d61563859bc9978"
  },
  {
    "partition": "4",
    "variants": 211,
    "digest": "645ac3482bd1c5dc4d1f37a1507e71139fbe96a7062de5ca54ac2598f44e59fd"
  },
  {
    "partition": "5",
    "variants": 257,
    "digest": "e95f32fe41af1c5f9ca4c18c114f09cdbde793f15d4d4516be8386e84dc615f1"
  },
  {
    "partition": "6",
    "variants": 287,
    "digest": "2934a4d6f2b8e842ed0ded07ffaea1315ded6a70e46242c55c475b00c9d896c5"
  },
  {
    "partition": "7",
    "variants": 350,
    "digest": "82fcf9f5358140735dc335137cd2d6c4aba2d14d1b06d74961eb79d623ccb05e"
  },
  {
    "partition": "8",
    "variants": 381,
    "digest": "d1df983317e933b2382711328b9cbcc214b6757e7a6e54a483112851a48de3b5"
  },
  {
    "partition": "9",
    "variants": 324,
    "digest": "8fddc79af4315b8343f092d589ba62409dbdf6f3820729ec032692ee201b5294"
  },
  {
    "partition": "a",
    "variants": 373,
    "digest": "ae8796fc2c5f4013c840e652ca6d99b63b3c0f2ddf9523c327a278568b864f2f"
  },
  {
    "partition": "b",
    "variants": 414,
    "digest": "0054cf4a4fcdfc1e0003998a45877f57a5a819d52c96e4f17191c97d0c728004"
  },
  {
    "partition": "c",
    "variants": 517,
    "digest": "6bd36579e43bcea0df9046d501fa5b8e1fda0320e3c648a04a4ce1c431b85040"
  },
  {
    "partition": "d",
    "variants": 538,
    "digest": "0a0afabe71966afcbf90955bf187f42dfa9cf342c3100c678ffca85897096d6f"
  },
  {
    "partition": "e",
    "variants": 587,
    "digest": "739e42c871d28d8a12a8a35eb544acd6b4508b43465df824ee07c0f01c9447ae"
  },
  {
    "partition": "f",
    "variants": 580,
    "digest": "4c5cd885a2d8b4713b231abb4b02850bd972c013c39d2095642d120f97b3eeab"
  }
];
// Prints a reviewed transaction; does not open a database connection.
if (process.argv[1]?.endsWith('captured-artwork-recovery-partition.mjs')) {
 const selected=partitions.find(batch=>batch.partition===process.argv[2]);
 if (!selected) throw new Error('Specify one reviewed partition: 0..f');
 const template=await readFile(new URL('../../supabase/manual/restore_captured_same_printing_artwork_20260910.sql',import.meta.url),'utf8');
 console.log(partitionSql(template,selected));
}
