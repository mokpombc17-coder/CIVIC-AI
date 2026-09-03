import { z } from "zod";

const uuidSchema = z.string().uuid();
const iso8601Schema = z.string().min(1);

export const sensitiveSurveyConsentDocumentSchema = z.object({
  documentCode: z.string().min(1),
  documentVersion: z.string().min(1),
  content: z.string().min(1),
});

export const acceptSensitiveSurveyConsentRequestSchema = z.object({
  documentCode: z.string().min(1),
  documentVersion: z.string().min(1),
  roundId: uuidSchema,
  clientClickedAt: iso8601Schema.optional(),
});

export const acceptSensitiveSurveyConsentResponseSchema = z.object({
  consentReceiptId: uuidSchema,
  acceptedAt: iso8601Schema,
});

export type SensitiveSurveyConsentDocument = z.infer<typeof sensitiveSurveyConsentDocumentSchema>;
export type AcceptSensitiveSurveyConsentRequest = z.infer<
  typeof acceptSensitiveSurveyConsentRequestSchema
>;
export type AcceptSensitiveSurveyConsentResponse = z.infer<
  typeof acceptSensitiveSurveyConsentResponseSchema
>;
