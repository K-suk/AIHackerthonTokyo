import bcrypt from "bcryptjs";

// 店舗共通パスコードの bcrypt ハッシュを作る（Phase 9）。
// 使い方: npm run hash-passcode -- <パスコード>
// 出力されたハッシュを .env の STORE_PASSCODE_HASH に設定する（平文は保存しない）。

const passcode = process.argv[2];
if (!passcode) {
  console.error("使い方: npm run hash-passcode -- <パスコード>");
  process.exit(1);
}

console.log(bcrypt.hashSync(passcode, 10));
