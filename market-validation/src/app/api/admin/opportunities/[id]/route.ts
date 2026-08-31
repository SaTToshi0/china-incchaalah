import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const supabase = createServerClient();
    const { id } = await context.params;

    const { data: opportunity, error: oppError } = await supabase
      .from('opportunities')
      .select('*')
      .eq('id', id)
      .single();

    if (oppError) throw oppError;

    // Fetch related responses using a simple assumed relation
    const { data: responses, error: respError } = await supabase
      .from('survey_responses')
      .select('*')
      .eq('opportunity_id', id);

    if (respError) throw respError;

    // Aggregate data
    const countryDistribution = (responses || []).reduce((acc: any, curr: any) => {
      acc[curr.country_code] = (acc[curr.country_code] || 0) + 1;
      return acc;
    }, {});

    const timelineData = (responses || []).reduce((acc: any, curr: any) => {
      const week = new Date(curr.created_at).toISOString().slice(0, 10); // Simplified to daily/weekly grouping proxy
      acc[week] = (acc[week] || 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      success: true,
      data: {
        ...opportunity,
        survey_responses: responses,
        countryDistribution,
        timelineData,
        scoreBreakdown: {
          total: opportunity.opportunity_score,
          // Placeholder values assuming they are stored or re-calculated
        }
      }
    });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Opportunity GET error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { id } = await context.params;

    const supabase = createServerClient();
    const { data, error } = await supabase.from('opportunities').update(body).eq('id', id).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Opportunity PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
