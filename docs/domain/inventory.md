# Ombor moduli va tannarx hisobi

> `architecture.md` ga qo'shimcha. I9 invarianti shu yerda ta'riflanadi.
> Claude Code uchun prompt: `../prompts/02-slices.md`.

## 1. Nega bu qaror ledger'ni o'zgartiradi

Ombor integratsiya bo'lganda tannarx tashqaridan keladigan raqam edi. O'zimiz qurganimizda **tannarx hisoblanadigan kattalikka aylanadi** va bu ledger'ga ikkita yangi yozuv oqimi qo'shadi:

```
Tovar kirimi:     Dt 1400 Zaxira          Ct 2100 Yetkazib beruvchiga qarz
Tovar chiqimi:    Dt 5100 Sotilgan tovar  Ct 1400 Zaxira
                       tannarxi (COGS)
```

Bundan kelib chiqadi: **ОПиУ dagi «Tannarx» satri endi qo'lda kiritilmaydi.** U ombor harakatidan avtomatik chiqadi. Bu Fintablo bilan farqning eng katta joyi — u yerda tannarx qo'lda yoki tashqi tizimdan tortiladi va shuning uchun hech qachon Balans bilan to'liq mos kelmaydi.

**Yangi invariant — I9:** har qanday vaqtda `Zaxira hisobining ledger qoldig'i = ombor jadvalidagi barcha partiyalar qiymati yig'indisi`. Bu ikkalasi ajralib qolsa, tizim yolg'on gapiradi. Har oy yopilishida avtomatik tekshiriladi va farq bo'lsa oyni yopishga ruxsat berilmaydi.

## 2. Baholash usuli

| Usul                                             | Holati                     | Izoh                                                       |
| ------------------------------------------------ | -------------------------- | ---------------------------------------------------------- |
| **O'rtacha siljuvchi (moving weighted average)** | Sukut bo'yicha             | MSB uchun eng tushunarli, hisoblash arzon                  |
| **FIFO (partiyalar bo'yicha)**                   | Opsiya                     | Muddatli tovar, import, valyuta tebranishi katta bo'lganda |
| LIFO                                             | **Qo'llab-quvvatlanmaydi** | IAS 2 bo'yicha taqiqlangan, UZ da ham qo'llanilmaydi       |

Usul **ombor darajasida** emas, **yuridik shaxs darajasida** tanlanadi va o'zgartirilganda faqat kelgusi davrga ta'sir qiladi (retroaktiv qayta hisoblash yo'q — bu buxgalteriya tamoyili).

### 2.1 Eng qiyin texnik masala: kechikkan kirim

Real hayotda shunday bo'ladi: 5-avgustda tovar sotildi, 12-avgustda uning kirim hujjati kiritildi. O'rtacha tannarx endi noto'g'ri hisoblangan.

Yechim — **davr ichida qayta hisoblash (period recalculation):**

1. Chiqim vaqtida joriy o'rtacha tannarx bo'yicha vaqtinchalik yozuv qilinadi.
2. Oy yopilishida `recalculate_costs(entity, month)` ishga tushadi: shu oydagi barcha harakatlar sana bo'yicha qayta ketma-ketlanadi, tannarx qayta hisoblanadi.
3. Farq **storno + yangi yozuv** sifatida ledger'ga tushadi (I4 buzilmaydi). Ya'ni tuzatish ko'rinadi va tushuntiriladi, jimgina o'zgarmaydi.
4. Davr qulflangandan keyin qayta hisoblash mumkin emas.

Bu jarayon oy yopish checklist'ining majburiy bandi.

## 3. Ma'lumotlar modeli

```sql
create table warehouse (
  id uuid primary key, org_id uuid not null,
  legal_entity_id uuid not null,
  name text not null,
  kind text not null,            -- main | retail_point | transit | virtual | consignment
  responsible_user_id uuid
);

create table product (
  id uuid primary key, org_id uuid not null,
  sku text, name text not null,
  kind text not null,            -- goods | material | service | kit | asset
  unit_id uuid not null,
  category_id uuid,
  ikpu_code text,                -- UZ: soliq tasnifi
  package_code text,             -- UZ: qadoq kodi
  is_marked boolean default false, -- UZ: markirovka
  vat_rate numeric(5,2),
  track_batches boolean default false,
  track_serials boolean default false,
  min_stock numeric(20,4),
  unique (org_id, sku)
);

create table stock_lot (                 -- FIFO va muddat uchun partiya
  id uuid primary key, org_id uuid not null,
  product_id uuid not null, warehouse_id uuid not null,
  received_at date not null,
  qty_initial numeric(20,4) not null,
  qty_remaining numeric(20,4) not null,
  unit_cost numeric(20,4) not null,      -- landed cost bilan
  currency char(3) not null,
  expires_on date, batch_no text,
  source_doc_id uuid
);

create table stock_document (
  id uuid primary key, org_id uuid not null,
  legal_entity_id uuid not null,
  kind text not null,   -- receipt | issue | transfer | writeoff | stocktake
                        -- | return_in | return_out | assembly | disassembly
  doc_date date not null, number text,
  warehouse_id uuid, warehouse_to_id uuid,
  counterparty_id uuid, deal_id uuid, direction_id uuid,
  status text not null, -- draft | posted | reversed
  journal_entry_id uuid,
  einvoice_id text                       -- UZ: Didox EHF bog'lanishi
);

create table stock_movement (
  id uuid primary key, org_id uuid not null,
  document_id uuid not null references stock_document,
  product_id uuid not null, warehouse_id uuid not null,
  lot_id uuid references stock_lot,
  qty numeric(20,4) not null,            -- + kirim, − chiqim
  unit_cost numeric(20,4) not null,
  total_cost numeric(20,4) not null,
  serial_no text
);

create table landed_cost_allocation (    -- import xarajatlarini tannarxga qo'shish
  id uuid primary key, org_id uuid not null,
  document_id uuid not null,
  cost_article_id uuid not null,         -- bojxona, transport, sug'urta
  amount numeric(20,4) not null, currency char(3) not null,
  basis text not null                    -- by_value | by_weight | by_qty | by_volume
);

create table stock_reservation (         -- bitim uchun tovar band qilish
  id uuid primary key, org_id uuid not null,
  deal_id uuid not null, product_id uuid not null,
  warehouse_id uuid not null, qty numeric(20,4) not null,
  expires_at timestamptz
);
```

## 4. Funksional talablar

**Kirim (receipt).** Yetkazib beruvchidan tovar; EHF (Didox) dan avtomatik to'ldirish — bu UZ uchun katta yutuq, chunki hisob-faktura allaqachon elektron. Landed cost: bojxona to'lovi, transport, sug'urta qiymat/og'irlik/miqdor bo'yicha taqsimlanadi va tannarxga qo'shiladi (IAS 2 talabi).

**Chiqim (issue).** Sotuv, bitimga berish, ichki ehtiyoj. Bitimga berilganda avtomatik shu bitimning to'g'ridan-to'g'ri xarajatiga tushadi va rentabellikka ta'sir qiladi.

**Ko'chirish (transfer).** Omborlar orasida; tranzit ombor holati qo'llab-quvvatlanadi.

**Hisobdan chiqarish (writeoff).** Yaroqsiz, yo'qolgan, sinib qolgan. Sabab majburiy, `below_ebitda` emas — bu operatsion xarajat.

**Inventarizatsiya (stocktake).** Sanash varaqasi → fakt kiritish → ortiqcha/kamomad avtomatik hisoblanadi → tasdiqlangach ledger'ga ikkita yozuv (ortiqcha daromad, kamomad xarajat). Mobil telefonda skanerlash bilan sanash — F3.

**Yig'ish (assembly).** Sodda retsept (BOM): N ta komponent → 1 ta mahsulot. Komponentlar chiqim, mahsulot kirim, tannarx yig'indi. To'liq ishlab chiqarish (marshrut, ish markazlari, yarim tayyor mahsulot) — v1 qamrovidan tashqarida.

**Zaxira ko'rsatkichlari.** Qoldiq va qiymat; aylanish tezligi (kunlarda); harakatsiz tovar (slow-moving) 30/60/90 kun; minimal qoldiqdan pastga tushish ogohlantirishi; ABC/XYZ tahlil; SKU bo'yicha marja reytingi.

## 5. O'zbekiston nozikliklari

- **IKPU kodi** har bir tovar kartochkasida — EHF va soliq hisoboti uchun majburiy. Katalog `region_pack/uz` da saqlanadi va yangilanadi.
- **Markirovka** qilinadigan tovarlar (dori, poyabzal, tamaki, suv) uchun seriya raqamlarini kuzatish.
- **EHF dan avtomatik kirim:** Didox'dan kelgan hisob-faktura satrlari tovar kartochkalariga moslashtiriladi (mapping bir marta o'rnatiladi, keyin avtomatik). Bu ombor kiritishning 80% ishini yo'q qiladi.
- **QQS:** kirimdagi kiruvchi QQS zaxira tannarxiga qo'shilmaydi (QQS to'lovchi bo'lsa), aylanma soliq rejimida esa qo'shiladi. Rejimga bog'liq mantiq `region_pack` da.

## 6. Yo'l xaritasiga ta'siri

Ombor F2 ning oxiri va F3 ning boshiga tushadi, chunki u ОПиУ ning tannarx satriga bog'liq. Taxminiy qo'shimcha: **6–8 hafta**. Bu jiddiy, lekin qaytimi ham katta — ombori bo'lgan mijoz tizimdan chiqib keta olmaydi.

Claude Code uchun alohida prompt (03-hujjatdagi C promptlar uslubida):

```
Implement the inventory module. Read docs/domain/inventory.md first.

Non-negotiable: inventory is not a separate ledger. Every stock document posts
journal entries through packages/ledger. COGS on the P&L is derived from stock
movements, never entered by hand.

New invariant I9: the ledger balance of the inventory account must equal the sum
of stock_lot valuations at any point in time. Write that as a test that runs
against the seed dataset and as a check that blocks period close.

Order of work:
  1. Schema + migrations (warehouse, product, stock_lot, stock_document,
     stock_movement, landed_cost_allocation, stock_reservation).
  2. Valuation engine in packages/inventory: moving weighted average and FIFO,
     as two implementations of one interface. Pure functions over movement
     sequences — no DB access inside the calculation.
  3. Period recalculation: re-sequence a month's movements by date, recompute
     costs, emit reversal + corrected entries. Never mutate posted entries.
  4. Journal generators for each document kind.
  5. Landed cost allocation by value / weight / quantity / volume.
  6. Reports: stock balance, turnover days, slow-moving, margin by SKU.

Property tests I expect:
  - any permutation of the ORDER in which movements are entered, for the same
    set of movements with the same dates, produces the same closing valuation;
  - I9 holds after every posting and after every recalculation;
  - a reversed receipt restores the prior valuation exactly;
  - issuing more than available quantity fails with a typed error, never a
    negative lot.

Do not implement manufacturing BOM beyond simple assembly. Ask me before
touching the P&L cost-of-sales line.
```
