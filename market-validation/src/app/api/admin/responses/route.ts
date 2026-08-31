import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-helpers';
import { createServerClient } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    const url = new URL(request.url);
    const isExport = url.searchParams.get('export') === 'csv';
    
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '25');
    const sort = url.searchParams.get('sort') || 'created_at';
    const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
    
    const search = url.searchParams.get('search');
    const category = url.searchParams.get('category');
    const country = url.searchParams.get('country');
    const hasContact = url.searchParams.get('has_contact');
    const dateFrom = url.searchParams.get('date_from');
    const dateTo = url.searchParams.get('date_to');

    const supabase = createServerClient();
    let query = supabase.from('survey_responses').select('*', { count: 'exact' });

    if (search) {
      query = query.or(`problem_text.ilike.%${search}%,product_text.ilike.%${search}%`);
    }
    if (category) {
      query = query.or(`problem_category.eq.${category},product_category.eq.${category}`);
    }
    if (country) {
      query = query.eq('country_code', country);
    }
    if (hasContact !== null) {
      query = query.eq('wants_contact', hasContact === 'true');
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    if (!isExport) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }
    
    query = query.order(sort, { ascending: order === 'asc' });

    const { data, error, count } = await query;
    if (error) throw error;

    if (isExport) {
      let csvContent = 'ID,Date,Pays,Problème,Produit,Contact,Email,Téléphone\n';
      data.forEach((row: any) => {
        const email = row.email ? row.email.substring(0, 3) + '***' : '';
        const phone = row.phone ? row.phone.substring(0, 3) + '***' : '';
        const problem = (row.problem_text || '').replace(/"/g, '""');
        const product = (row.product_text || '').replace(/"/g, '""');
        csvContent += `"${row.id}","${row.created_at}","${row.country_code}","${problem}","${product}",${row.wants_contact},"${email}","${phone}"\n`;
      });
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="responses.csv"'
        }
      });
    }

    return NextResponse.json({
      success: true,
      data,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Responses GET error:', error);
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
    const { error } = await supabase.from('survey_responses').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Responses DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
