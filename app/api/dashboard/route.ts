import {businessUser,businessFailure,BusinessError} from '@/lib/business-server';
import {dashboardSummary} from '@/lib/customer-list';
export const dynamic='force-dynamic';

// The dashboard's figures, computed by the database (the page used to download every customer,
// order and product to count them).
export async function GET(req:Request) {
  try{const user=await businessUser(req,'/api/dashboard');
    // Same audience as the dashboard page (middleware sends everyone else to their own home page).
    if(!['admin','general_manager','sales_manager'].includes(user.role))throw new BusinessError('لا تملك صلاحية عرض لوحة التحكم.',403);
    return Response.json(await dashboardSummary(),{headers:{'Cache-Control':'no-store'}});
  }catch(e){return businessFailure(e);}
}
