import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const token = Deno.env.get('ONEMAP_API_TOKEN')

  const { data: rows } = await supabase
    .from('geocoding_cache')
    .select('*')
    .in('status',['pending','retry'])
    .limit(20)

  let processed = 0

  for (const row of rows ?? []) {
    try {
      const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${row.postal_code}&returnGeom=Y&getAddrDetails=Y&pageNum=1`

      const res = await fetch(url,{ headers:{ Authorization:`Bearer ${token}` } })
      const json = await res.json()

      const first = json.results?.[0]

      if (!first) {
        await supabase.from('geocoding_cache').update({ status:'failed' }).eq('postal_code',row.postal_code)
        continue
      }

      await supabase
        .from('geocoding_cache')
        .update({
          building:first.BUILDING,
          block:first.BLK_NO,
          road_name:first.ROAD_NAME,
          address:first.ADDRESS,
          latitude:Number(first.LATITUDE),
          longitude:Number(first.LONGITUDE),
          raw_response:first,
          status:'success',
          provider:'onemap',
          geocoded_at:new Date().toISOString()
        })
        .eq('postal_code',row.postal_code)

      await supabase
        .from('listing_indexes')
        .update({
          latitude:Number(first.LATITUDE),
          longitude:Number(first.LONGITUDE)
        })
        .eq('postal_code',row.postal_code)

      processed++
    } catch (e) {
      await supabase.from('geocoding_cache').update({ status:'retry' }).eq('postal_code',row.postal_code)
    }
  }

  return Response.json({ processed })
})