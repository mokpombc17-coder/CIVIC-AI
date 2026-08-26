import { notFound } from "next/navigation";
import { findLegalDocument, LEGAL_DOCUMENTS } from "@/lib/legal/legal-documents";
import { PlatformPageShell } from "@/components/platform-page-shell";

type LegalDocumentPageProps = Readonly<{
  params: Promise<{ documentId: string; version: string }>;
}>;

export function generateStaticParams() {
  return Object.values(LEGAL_DOCUMENTS).map((document) => ({
    documentId: document.slug,
    version: document.version,
  }));
}

export default async function LegalDocumentPage({ params }: LegalDocumentPageProps) {
  const { documentId, version } = await params;
  const document = findLegalDocument(documentId, version);
  if (!document) notFound();

  return (
    <PlatformPageShell bottomNavigation={null} title={document.title}>
      <article
        className="civic-legal-document"
        data-document-id={document.id}
        data-document-sha256={document.bodySha256}
        data-document-version={document.version}
      >
        <header>
          <p>고정 문서 · 버전 {document.version}</p>
          <p>시행일 {document.effectiveDate}</p>
        </header>
        <p className="civic-legal-notice">
          현재 문서는 합성 데이터 개발 검증용 고정 기준입니다. 운영 공개는 LEGAL-04 법률 검토와
          권리행사 연락처 확정 후에만 가능합니다.
        </p>
        <section>
          {document.body.split("\n\n").map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
        <footer>
          <small>본문 SHA-256: {document.bodySha256}</small>
        </footer>
      </article>
    </PlatformPageShell>
  );
}
