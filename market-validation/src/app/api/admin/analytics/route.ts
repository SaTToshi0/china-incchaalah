import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createServerClient();

    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: responses, error } = await supabase
      .from('survey_responses')
      .select('created_at, problem_category, product_category, country_code, wants_contact, contact_consent, problem_text, product_text')
      .gte('created_at', ninetyDaysAgo);

    if (error) throw error;

    const responsesOverTime: Record<string, number> = {};
    const categoryDistribution: Record<string, number> = {};
    const countryDistRaw: Record<string, number> = {};
    const problemFreq: Record<string, number> = {};
    const productFreq: Record<string, number> = {};
    
    let wantsContact = 0;
    let hasConsent = 0;

    (responses || []).forEach(r => {
      // Over time
      const date = r.created_at.split('T')[0];
      responsesOverTime[date] = (responsesOverTime[date] || 0) + 1;

      // Categories
      if (r.problem_category) categoryDistribution[r.problem_category] = (categoryDistribution[r.problem_category] || 0) + 1;
      if (r.product_category) categoryDistribution[r.product_category] = (categoryDistribution[r.product_category] || 0) + 1;

      // Countries
      if (r.country_code) countryDistRaw[r.country_code] = (countryDistRaw[r.country_code] || 0) + 1;

      // Funnel
      if (r.wants_contact) wantsContact++;
      if (r.contact_consent) hasConsent++;

      // Text frequency (naive)
      if (r.problem_text) problemFreq[r.problem_text] = (problemFreq[r.problem_text] || 0) + 1;
      if (r.product_text) productFreq[r.product_text] = (productFreq[r.product_text] || 0) + 1;
    });

    const countryDistribution = Object.entries(countryDistRaw).sort((a, b) => b[1] - a[1]).slice(0, 20);
    const topProblems = Object.entries(problemFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const topProducts = Object.entries(productFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);

    return NextResponse.json({
      success: true,
      data: {
        responsesOverTime,
        categoryDistribution,
        countryDistribution,
        contactFunnel: {
          totalResponses: responses?.length || 0,
          wantsContact,
          hasConsent
        },
        topProblems,
        topProducts
      }
    });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Analytics GET error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
