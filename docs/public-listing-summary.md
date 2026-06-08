# Public Listing Summary Field

## Purpose

`listing_ai_analysis.public_summary` is the only summary field intended for public frontend display.

It is used by the NTU rental homepage to show a clean, readable listing introduction without exposing raw source content.

## Why this field exists

Older summary fields have different purposes:

- `listing_indexes.summary`: indexing/search helper. It may contain compressed original ad text, repeated phrases, contact details, or source-style wording.
- `listing_ai_analysis.summary_ai`: internal AI analysis summary. It may be short, tag-like, or model-oriented.
- `listing_ai_analysis.public_summary`: public-facing copy. It should be readable, neutral, and safe to display.

Frontend pages should prefer `listing_ai_analysis.public_summary` and should not display raw listing text.

## Display rules

`public_summary` must not include:

- Original photos
- Original full ad copy
- Phone numbers
- WeChat IDs
- WhatsApp numbers
- Telegram handles
- Landlord names
- Exact unit numbers
- Exact block + unit combinations such as `Block 445 #08-123`

It may include:

- Room type
- Rent
- General area
- Postal code
- Move-in availability
- Cooking availability
- Address registration availability
- Neutral description of the rental context

## Recommended writing style

Use short, neutral, readable Chinese.

Example:

```text
位于Jurong West区域的普通房，月租约$1200，邮编648364，可做饭，可报地址。适合希望了解NTU西部通勤圈房源的租客参考，具体租期、费用和入住条件请自行核实。
```

Avoid promotional or guarantee-style wording:

```text
强烈推荐，绝对真实，最适合NTU学生，马上联系房东。
```

Avoid source-like raw wording:

```text
Blk 445 #08-123 微信xxx 电话88888888 马上入住 包水电 房东直租好房不等人。
```

## Frontend usage

Homepage listing cards should query:

```sql
listing_ai_analysis.public_summary
```

The frontend may use a safe fallback if this field is empty, but fallback text should also avoid contact details, names, exact unit numbers, and original ad copy.

## Generation responsibility

This field should be generated or refreshed by the AI enrichment pipeline, not by the frontend.

The frontend should only read and render it.
