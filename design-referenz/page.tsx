import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAccessibleSchemaIds } from '@/lib/access'
import type { CrossRefTile, SchemaRow } from '@/lib/schemas'
import { LibraryShell } from './library-shell'

export const metadata: Metadata = {
  title: 'Bibliothek',
}

const FULL_IMAGE_TTL_SECONDS = 60 * 60

const SELECT_FIELDS =
  'id, slug, title, synonyms, abbreviations, primary_categories, secondary_tags, image_filename, aspect_ratio, description, included_diagnoses, key_imaging_features, clinical_triggers, modality, is_free, is_published, illustration_filenames, illustration_description, video_url, bibliography, version, last_updated_at, created_at'

type SearchParams = Promise<{
  schema?: string
  kategorie?: string
  sort?: string
  q?: string
}>

export default async function BibliothekPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const params = await searchParams
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const userId = user?.id ?? null
  const userEmail = user?.email ?? null
  const isAnonymous = userId === null

  // Anon-Modus: nur Free-Schemata in der Liste. Premium-Slugs, die per Direkt-
  // Link adressiert werden, leiten unten auf /login mit redirect-Param.
  let schemasQuery = supabase
    .from('schemas')
    .select(SELECT_FIELDS)
    .order('title', { ascending: true })
  if (isAnonymous) {
    schemasQuery = schemasQuery.eq('is_free', true)
  }
  const { data: schemasData } = await schemasQuery

  const schemas: SchemaRow[] = (schemasData ?? []) as SchemaRow[]
  const accessibleIds = await getAccessibleSchemaIds(supabase, userId)

  // Direkt-Link zu Premium-Schema im Anon-Modus → erst nach Login zugreifbar.
  // Wir prüfen separat, weil das Schema oben aus der Liste rausgefiltert wurde.
  if (isAnonymous && params.schema) {
    const { data: premiumProbe } = await supabase
      .from('schemas')
      .select('slug, is_free')
      .eq('slug', params.schema)
      .maybeSingle()
    if (premiumProbe && !premiumProbe.is_free) {
      const target = `/bibliothek?schema=${encodeURIComponent(params.schema)}`
      redirect(`/login?redirect=${encodeURIComponent(target)}`)
    }
  }

  // Premium-Counter für Anon-CTA. Für eingeloggte Nutzer überflüssig.
  let premiumCount = 0
  if (isAnonymous) {
    const { count } = await supabase
      .from('schemas')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', true)
      .eq('is_free', false)
    premiumCount = count ?? 0
  }

  const previewUrlByFilename: Record<string, string> = {}
  for (const schema of schemas) {
    const { data } = supabase.storage
      .from('schema-previews')
      .getPublicUrl(schema.image_filename)
    // Cache-Buster: schema-previews ist public und wird vom Browser stabil
    // gecached. last_updated_at als ?v= sorgt dafür, dass Bilder nach Edits
    // frisch geladen werden, ohne den Cache für unveränderte Schemata zu
    // brechen.
    previewUrlByFilename[schema.image_filename] = `${data.publicUrl}?v=${encodeURIComponent(schema.last_updated_at)}`
  }

  const selectedSchema = params.schema
    ? (schemas.find((s) => s.slug === params.schema) ?? null)
    : null

  let selectedFullUrl: string | null = null
  if (selectedSchema && accessibleIds.has(selectedSchema.id)) {
    const { data } = await supabase.storage
      .from('schema-full')
      .createSignedUrl(selectedSchema.image_filename, FULL_IMAGE_TTL_SECONDS)
    selectedFullUrl = data?.signedUrl ?? null
  }

  // Cross-References (verwandte Schemata) des ausgewählten Schemas, nach
  // display_order. Embed über den to_schema_id-FK. Anon sieht nur freie, alle
  // nur veröffentlichte Ziele. Auf 5 Kacheln begrenzt (Anzeige-Limit).
  type CrossRefRow = {
    target: {
      slug: string
      title: string
      primary_categories: string[] | null
      image_filename: string
      last_updated_at: string
      is_published: boolean
      is_free: boolean
    } | null
  }
  const crossReferences: CrossRefTile[] = []
  if (selectedSchema) {
    const { data: refRows } = await supabase
      .from('schema_cross_references')
      .select(
        'display_order, target:schemas!to_schema_id(slug, title, primary_categories, image_filename, last_updated_at, is_published, is_free)',
      )
      .eq('from_schema_id', selectedSchema.id)
      .order('display_order', { ascending: true })

    for (const row of (refRows ?? []) as unknown as CrossRefRow[]) {
      const target = row.target
      if (!target || !target.is_published) continue
      if (isAnonymous && !target.is_free) continue
      const { data: pub } = supabase.storage
        .from('schema-previews')
        .getPublicUrl(target.image_filename)
      crossReferences.push({
        slug: target.slug,
        title: target.title,
        primary_categories: target.primary_categories ?? [],
        previewUrl: `${pub.publicUrl}?v=${encodeURIComponent(target.last_updated_at)}`,
      })
      if (crossReferences.length >= 5) break
    }
  }

  const availableCategories = new Set<string>()
  for (const s of schemas) {
    for (const c of s.primary_categories) availableCategories.add(c)
  }

  return (
    <LibraryShell
      schemas={schemas}
      accessibleIds={Array.from(accessibleIds)}
      previewUrlByFilename={previewUrlByFilename}
      selectedSchemaSlug={selectedSchema?.slug ?? null}
      selectedFullUrl={selectedFullUrl}
      crossReferences={crossReferences}
      activeCategory={params.kategorie ?? null}
      sort={params.sort ?? 'alpha'}
      initialQuery={params.q ?? ''}
      isAnonymous={isAnonymous}
      userEmail={userEmail}
      premiumCount={premiumCount}
      availableCategories={Array.from(availableCategories)}
    />
  )
}
