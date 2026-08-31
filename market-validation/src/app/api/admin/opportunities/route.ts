import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createServerClient } from '@/lib/supabase';
import { calculateOpportunityScore } from '@/lib/opportunity-engine';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');
    const minScore = url.searchParams.get('min_score');
    const sort = url.searchParams.get('sort') || 'score';
    
    const supabase = createServerClient();
    let query = supabase.from('opportunities').select('*');

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (minScore) query = query.gte('opportunity_score', minScore);

    let orderCol = 'opportunity_score';
    if (sort === 'demand') orderCol = 'demand_score';
    else if (sort === 'growth') orderCol = 'growth_score';
    else if (sort === 'recent') orderCol = 'created_at';

    query = query.order(orderCol, { ascending: false });

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Opportunities GET error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const { name, problem_summary, product_summary, category, status } = body;

    const metrics = {
      demandCount: body.demandCount || 10,
      interestCount: body.interestCount || 7,
      contactCount: body.contactCount || 4,
      growthRate: body.growthRate || 15,
      totalResponses: body.totalResponses || 100,
    };
    const score = calculateOpportunityScore(metrics);

    const supabase = createServerClient();
    const { data, error } = await supabase
      .from('opportunities')
      .insert([{ name, problem_summary, product_summary, category, status, opportunity_score: score.total }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Opportunities POST error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const body = await request.json();

    if (!id) return NextResponse.json({ success: false, error: 'ID requis' }, { status: 400 });

    const supabase = createServerClient();
    const { data, error } = await supabase.from('opportunities').update(body).eq('id', id).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Opportunities PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) return NextResponse.json({ success: false, error: 'ID requis' }, { status: 400 });

    const supabase = createServerClient();
    const { error } = await supabase.from('opportunities').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Opportunities DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
