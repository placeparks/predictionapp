-- ============================================================================
-- INSERT ELIGIBILITY DATA
-- ============================================================================
-- Run this AFTER running COMPLETE_DATABASE_SCHEMA.sql
-- This restores the eligibility/tier data for existing users
-- ============================================================================

-- Insert eligibility records
-- Note: Addresses will be automatically lowercased by the trigger
INSERT INTO eligibility (address, tier, next_tier, last_computed_at, minted_tier, minted_animal, minted_token_id, minted_metadata_url, minted_at)
VALUES
  ('0x0cb43ef0a6b2bd454fa5222c519184dafb1bf0c2', 1, 2, '2025-11-08 04:22:34.419+00', NULL, NULL, NULL, NULL, NULL),
  ('0x17b47ffdbd032016f2439029890ed917bf3cfbfa', 4, 5, '2025-11-08 21:50:03.871+00', 4, 'Dragon', 4, 'https://gateway.pinata.cloud/ipfs/QmcpS5oY9FgsUQvjGFycwEJ2LmWpXqi9gD61zvCnitNa8N', '2025-11-04 13:22:37.453+00'),
  ('0x21a5625fc19469c11555b5607edb2b97324e7d82', 4, 5, '2025-11-07 20:38:55.616+00', 4, 'Dragon', 3, 'https://gateway.pinata.cloud/ipfs/QmfEc4MoyGEsn5YhcpxQA1Xc3h9TPDdjdLksEfNkjpYdHG', '2025-11-03 14:30:16.772+00'),
  ('0x3de471c584c3bf21bc769da1f160bfbe42da8d35', 3, 4, '2025-11-08 20:45:27.435+00', 3, 'Tiger', 6, 'https://gateway.pinata.cloud/ipfs/QmWKNsSsYLudrzfS6zhJFTsdc8CezCkqxmdHFgUMwbEi6e', '2025-11-08 20:45:27.435+00'),
  ('0x684d24bbd11435d4da01b1b0378db4470ad93db0', 1, 2, '2025-11-08 04:25:50.78+00', NULL, NULL, NULL, NULL, NULL),
  ('0x81a8be7ea60cc1483767c66b2c6a708e88b4e61b', 2, 3, '2025-11-06 19:07:21.433+00', NULL, NULL, NULL, NULL, NULL),
  ('0x863283d940b9e4dddd447ecbdb62e6d32824ba09', 1, 2, '2025-11-08 04:25:46.392+00', NULL, NULL, NULL, NULL, NULL),
  ('0x872a730a8faa61901ea78446a29064e2b68951b1', 1, 2, '2025-11-04 20:48:24.663+00', 1, 'Goat', 1, 'https://gateway.pinata.cloud/ipfs/QmZEmwxpc9vLofQTSbtU8kYv9V7DdrmJ7hUtP7YVBNdHnq', '2025-11-03 12:49:17.025+00'),
  ('0x89a08cd86a2c2f93802020a9ba2d6e5b8d211320', 0, 1, '2025-11-06 19:10:14.984+00', NULL, NULL, NULL, NULL, NULL),
  ('0x8af23496c4f79be78616daf6b6d69bcf99577bff', 0, 1, '2025-11-13 11:17:14.599+00', NULL, NULL, NULL, NULL, NULL),
  ('0x95205e1fba8dee07dd457558c83a6d395910570c', 5, 5, '2025-11-12 17:17:16.892+00', 5, 'Phoenix', 7, 'https://gateway.pinata.cloud/ipfs/QmZNdkcxc7xF6pF3kCphrseHeTTQFjtSLVq6tSZTtFvkyj', '2025-11-10 12:22:42.034+00'),
  ('0xa17b290af9caadfaadf7dd553c41242f05cd9a14', 4, 5, '2025-11-09 11:26:49.16+00', 4, 'Dragon', 2, 'https://gateway.pinata.cloud/ipfs/QmaFJpBtm7rBtiUwDdPrGY2Yhya5pRzUcgdmKGtjq3fzsR', '2025-11-03 14:19:28.556+00'),
  ('0xb68ed3f5ae2dac32e6d63189e5fa9e4e41095ed5', 0, 1, '2025-11-04 06:25:58.166+00', NULL, NULL, NULL, NULL, NULL),
  ('0xbe07d1cb9f852bdca7abee2bd5c73037a27622a9', 1, 2, '2025-11-13 11:17:26.501+00', NULL, NULL, NULL, NULL, NULL),
  ('0xc2735a43d257e28ceab97959c5eb46ecac65b571', 0, 1, '2025-11-08 20:19:17.997+00', NULL, NULL, NULL, NULL, NULL),
  ('0xc58321d917cfe8dc961c5f5885c3ec0e6f5b84a1', 1, 2, '2025-11-06 19:10:23.795+00', NULL, NULL, NULL, NULL, NULL),
  ('0xc6c380c5ce5e95d7774cf31bfb744c478d4751fe', 0, 1, '2025-11-13 11:17:22.693+00', NULL, NULL, NULL, NULL, NULL),
  ('0xc878cc072ac3a869a938a99da404d25850835a20', 4, 5, '2025-11-04 20:48:50.319+00', NULL, NULL, NULL, NULL, NULL),
  ('0xce9c88ac1e575ad8fa83107bf93bccc643dfbb23', 0, 1, '2025-11-06 19:30:46.2+00', NULL, NULL, NULL, NULL, NULL),
  ('0xd0d2e2206e44f818006ebc19f2fdb16a80a0d1fb', 4, 5, '2025-11-08 21:52:46.082+00', NULL, NULL, NULL, NULL, NULL),
  ('0xd4faa237ec6aea37052ce133d49a5dbf164de5ac', 4, 5, '2025-11-04 13:27:11.438+00', NULL, NULL, NULL, NULL, NULL),
  ('0xd860f0ac9be840b18ed4f1f2f39ea057e6583d1e', 1, 2, '2025-11-13 11:14:52.519+00', 1, 'Goat', 5, 'https://gateway.pinata.cloud/ipfs/QmSQbLq5Cin7pK7HXVS7AsRj9E5iMWJuxAX1FY1vXqXZYW', '2025-11-04 20:55:31.752+00')
ON CONFLICT (address) DO UPDATE SET
  tier = EXCLUDED.tier,
  next_tier = EXCLUDED.next_tier,
  last_computed_at = EXCLUDED.last_computed_at,
  minted_tier = EXCLUDED.minted_tier,
  minted_animal = EXCLUDED.minted_animal,
  minted_token_id = EXCLUDED.minted_token_id,
  minted_metadata_url = EXCLUDED.minted_metadata_url,
  minted_at = EXCLUDED.minted_at;

-- ============================================================================
-- END OF ELIGIBILITY DATA INSERT
-- ============================================================================

