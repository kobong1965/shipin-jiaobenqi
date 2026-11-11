ALTER TABLE product_sets
  ADD COLUMN category text NOT NULL DEFAULT 'uncategorized'
    CHECK(category IN ('us-men','us-women','douyin-clothing','uncategorized'));

-- Only the twelve verified imports from 鑫天晨女装｜TK美区 are classified here.
-- Other existing sets keep their neutral default until explicitly classified.
UPDATE product_sets SET category='us-women'
WHERE id IN (
  '144bf096-c245-4b61-a155-5d04c0079044',
  'df86b135-f1c5-422a-b921-bb1990e07199',
  '43f1d886-5f55-40b7-b3c4-e88ec6830201',
  '2692d35c-9de0-4d97-8eda-9c10538e981b',
  '6c1e83b4-a8cc-409b-b9d7-8325d25a4b03',
  'd27a5543-b1f3-4e8c-9fec-df314b178014',
  '37171523-f389-4d50-bbf1-d127d0395b85',
  '82ee3d72-51b0-42e6-8234-0aa552a75690',
  '6c20475d-1d1e-4ab1-bdbc-debf5f90cd06',
  'e538cf40-7954-4ba8-a3a2-9e0f7b62a3ce',
  'aa5b91d9-7553-4e9c-9550-a669e6ca7194',
  '15f0dcb6-aa80-426c-a42e-14b43c3a85d8'
);
