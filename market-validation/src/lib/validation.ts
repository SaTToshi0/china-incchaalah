import { z } from 'zod';

export const problemSchema = z.discriminatedUnion('problem_type', [
  z.object({
    problem_type: z.literal('free_text'),
    problem_text: z.string()
      .min(10, 'Veuillez décrire votre problème en au moins 10 caractères.')
      .max(2000, 'La description ne peut pas dépasser 2000 caractères.'),
    problem_category: z.null().optional(),
  }),
  z.object({
    problem_type: z.literal('category'),
    problem_category: z.enum(['mode', 'tech', 'beaute'], {
      message: 'Veuillez sélectionner une catégorie valide.',
    }),
    problem_text: z.null().optional(),
  }),
]);

export const productSchema = z.discriminatedUnion('product_type', [
  z.object({
    product_type: z.literal('free_text'),
    product_text: z.string()
      .min(10, 'Veuillez décrire votre idée de produit en au moins 10 caractères.')
      .max(2000, 'La description ne peut pas dépasser 2000 caractères.'),
    product_category: z.null().optional(),
  }),
  z.object({
    product_type: z.literal('category'),
    product_category: z.enum(['mode', 'tech', 'beaute'], {
      message: 'Veuillez sélectionner une catégorie valide.',
    }),
    product_text: z.null().optional(),
  }),
]);

export const contactSchema = z.discriminatedUnion('wants_contact', [
  z.object({
    wants_contact: z.literal(false),
    country: z.null().optional(),
    country_code: z.null().optional(),
    contact_method: z.null().optional(),
    phone: z.null().optional(),
    email: z.null().optional(),
    contact_consent: z.literal(false).optional(),
  }),
  z.object({
    wants_contact: z.literal(true),
    country: z.string().min(1, 'Veuillez sélectionner un pays.'),
    country_code: z.string().min(1),
    contact_method: z.enum(['whatsapp', 'phone', 'email'], {
      message: 'Veuillez choisir une méthode de contact.',
    }),
    phone: z.string().optional(),
    email: z.string().optional(),
    contact_consent: z.literal(true, {
      message: 'Vous devez accepter les conditions de contact.',
    }),
  }),
]).superRefine((data, ctx) => {
  if (data.wants_contact) {
    if (data.contact_method === 'whatsapp' || data.contact_method === 'phone') {
      if (!data.phone || data.phone.length < 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Veuillez entrer un numéro de téléphone valide.',
          path: ['phone'],
        });
      }
      const phoneRegex = /^\+?[0-9\s\-()]{6,20}$/;
      if (data.phone && !phoneRegex.test(data.phone)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Le format du numéro de téléphone est invalide.',
          path: ['phone'],
        });
      }
    }
    if (data.contact_method === 'email') {
      if (!data.email || data.email.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Veuillez entrer une adresse email.',
          path: ['email'],
        });
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (data.email && !emailRegex.test(data.email)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'L\'adresse email est invalide.',
          path: ['email'],
        });
      }
    }
  }
});

export const surveySubmissionSchema = z.object({
  problem_type: z.enum(['free_text', 'category']),
  problem_category: z.enum(['mode', 'tech', 'beaute']).nullable().optional(),
  problem_text: z.string().nullable().optional(),
  product_type: z.enum(['free_text', 'category']),
  product_category: z.enum(['mode', 'tech', 'beaute']).nullable().optional(),
  product_text: z.string().nullable().optional(),
  wants_contact: z.boolean(),
  country: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  contact_method: z.enum(['whatsapp', 'phone', 'email']).nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  contact_consent: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // Validate problem
  if (data.problem_type === 'free_text') {
    if (!data.problem_text || data.problem_text.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La description du problème doit contenir au moins 10 caractères.',
        path: ['problem_text'],
      });
    }
    if (data.problem_text && data.problem_text.length > 2000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La description ne peut pas dépasser 2000 caractères.',
        path: ['problem_text'],
      });
    }
  } else {
    if (!data.problem_category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Veuillez sélectionner une catégorie.',
        path: ['problem_category'],
      });
    }
  }

  // Validate product
  if (data.product_type === 'free_text') {
    if (!data.product_text || data.product_text.length < 10) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La description du produit doit contenir au moins 10 caractères.',
        path: ['product_text'],
      });
    }
    if (data.product_text && data.product_text.length > 2000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La description ne peut pas dépasser 2000 caractères.',
        path: ['product_text'],
      });
    }
  } else {
    if (!data.product_category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Veuillez sélectionner une catégorie.',
        path: ['product_category'],
      });
    }
  }

  // Validate contact
  if (data.wants_contact) {
    if (!data.country) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Pays requis.', path: ['country'] });
    }
    if (!data.contact_method) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Méthode de contact requise.', path: ['contact_method'] });
    }
    if (!data.contact_consent) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Consentement requis.', path: ['contact_consent'] });
    }
    if ((data.contact_method === 'whatsapp' || data.contact_method === 'phone') && (!data.phone || data.phone.length < 6)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Numéro de téléphone requis.', path: ['phone'] });
    }
    if (data.contact_method === 'email' && (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Email valide requis.', path: ['email'] });
    }
  }
});

export type SurveySubmission = z.infer<typeof surveySubmissionSchema>;
