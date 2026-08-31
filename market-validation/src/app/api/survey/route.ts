import { NextRequest, NextResponse } from 'next/server';
import { surveySubmissionSchema } from '@/lib/validation';
import { createServerClient } from '@/lib/supabase';
import { hashIP } from '@/lib/auth-helpers';

function sanitizeText(text: string | undefined | null) {
  if (!text) return text;
  return text.replace(/<[^>]*>?/gm, '').trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = surveySubmissionSchema.parse(body);

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || '127.0.0.1';
    const hashedIp = hashIP(ip);

    const supabase = createServerClient();
    
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: recentSubmissions, error: rateError } = await supabase
      .from('rate_limits')
      .select('id')
      .eq('ip_hash', hashedIp)
      .gte('created_at', oneHourAgo);
      
    if (rateError) throw rateError;
    
    if (recentSubmissions && recentSubmissions.length >= 5) {
      return NextResponse.json({ success: false, error: 'Trop de requêtes. Veuillez réessayer plus tard.' }, { status: 429 });
    }
    
    const sanitizedData = {
      ...validatedData,
      problem_text: sanitizeText(validatedData.problem_text),
      product_text: sanitizeText(validatedData.product_text),
      email: sanitizeText(validatedData.email),
      phone: sanitizeText(validatedData.phone),
    };

    const { data: response, error: insertError } = await supabase
      .from('survey_responses')
      .insert([sanitizedData])
      .select('id')
      .single();

    if (insertError) throw insertError;

    await supabase.from('rate_limits').insert([{ ip_hash: hashedIp }]);

    return NextResponse.json({ success: true, id: response.id }, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json({ success: false, error: 'Données invalides', details: error.errors }, { status: 400 });
    }
    console.error('Survey POST error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
