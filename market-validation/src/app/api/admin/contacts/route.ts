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

    const supabase = createServerClient();
    let query = supabase.from('survey_responses')
      .select('id, country_code, contact_method, email, phone, problem_text, product_text, created_at', { count: 'exact' })
      .eq('wants_contact', true)
      .eq('contact_consent', true)
      .order('created_at', { ascending: false });

    if (!isExport) {
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    if (isExport) {
      let csvContent = 'ID,Date,Pays,Méthode,Email,Téléphone,Problème,Produit\n';
      data.forEach((row: any) => {
        const problem = (row.problem_text || '').replace(/"/g, '""');
        const product = (row.product_text || '').replace(/"/g, '""');
        csvContent += `"${row.id}","${row.created_at}","${row.country_code}","${row.contact_method}","${row.email || ''}","${row.phone || ''}","${problem}","${product}"\n`;
      });
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="contacts.csv"'
        }
      });
    }

    const maskedData = data.map((row: any) => ({
      ...row,
      email: row.email ? row.email.substring(0, 3) + '***' : null,
      phone: row.phone ? row.phone.substring(0, 3) + '***' : null
    }));

    return NextResponse.json({
      success: true,
      data: maskedData,
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / limit)
    });
  } catch (error: any) {
    if (error.message === 'Non autorisé') return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    console.error('Contacts GET error:', error);
    return NextResponse.json({ success: false, error: 'Erreur interne du serveur' }, { status: 500 });
  }
}
