import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const supabase = createServerClient();
    
    // In a real scenario we might need to join or select relation data.
    const { data, error } = await supabase
      .from('product_tests')
      .select('*, opportunities(name)');

    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('ProductTests GET error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const supabase = createServerClient();

    const { data, error } = await supabase.from('product_tests').insert([body]).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('ProductTests POST error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth(request);
    const body = await request.json();
    const id = body.id; // or from URL
    if (!id) return NextResponse.json({ success: false, error: 'ID requis' }, { status: 400 });

    const supabase = createServerClient();
    const { data, error } = await supabase.from('product_tests').update(body).eq('id', id).select().single();
    if (error) throw error;

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('ProductTests PATCH error:', error);
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
    const { error } = await supabase.from('product_tests').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('ProductTests DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
