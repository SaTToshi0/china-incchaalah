import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createServerClient();

    const [
      { count: totalResponses },
      { count: wantsContactCount },
      { count: totalContacts },
      { data: countriesData },
      { data: categoriesData },
      { data: trendData }
    ] = await Promise.all([
      supabase.from('survey_responses').select('*', { count: 'exact', head: true }),
      supabase.from('survey_responses').select('*', { count: 'exact', head: true }).eq('wants_contact', true),
      supabase.from('survey_responses').select('*', { count: 'exact', head: true }).eq('wants_contact', true).eq('contact_consent', true),
      supabase.from('survey_responses').select('country_code'),
      supabase.from('survey_responses').select('problem_category, product_category'),
      supabase.from('survey_responses').select('created_at').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);

    const interestRate = totalResponses && wantsContactCount ? (wantsContactCount / totalResponses) * 100 : 0;
    const distinctCountries = new Set(countriesData?.map(d => d.country_code)).size;

    const categoryCounts = { problems: {} as Record<string, number>, products: {} as Record<string, number> };
    categoriesData?.forEach(row => {
      if (row.problem_category) {
        categoryCounts.problems[row.problem_category] = (categoryCounts.problems[row.problem_category] || 0) + 1;
      }
      if (row.product_category) {
        categoryCounts.products[row.product_category] = (categoryCounts.products[row.product_category] || 0) + 1;
      }
    });

    const recentTrend = {} as Record<string, number>;
    trendData?.forEach(row => {
      const date = row.created_at.split('T')[0];
      recentTrend[date] = (recentTrend[date] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      data: {
        totalResponses: totalResponses || 0,
        interestRate,
        totalContacts: totalContacts || 0,
        totalCountries: distinctCountries,
        categoryCounts,
        recentTrend
      }
    });
  } catch (error: any) {
    if (error.message === 'Non autorisé') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }
    console.error('Stats GET error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
