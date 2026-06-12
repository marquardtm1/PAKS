// /bibliothek ist seit Public-Access-Update auch für anonyme Nutzer
// zugänglich (Free-only-Sicht). Das Layout enforced bewusst keinen Auth-Check;
// die Page selbst entscheidet, welche Schemata sichtbar sind.
export default function BibliothekLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
