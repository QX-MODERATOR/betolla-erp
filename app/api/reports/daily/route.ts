import {businessUser,businessFailure,BusinessError} from '@/lib/business-server';
import {publishDailyReport} from '@/lib/daily-report-server';
import {SheetsError} from '@/lib/google-sheets';
import {ammanToday} from '@/lib/dates';
export const dynamic='force-dynamic';

// POST ?date=YYYY-MM-DD -> (re)build that day's tab in the daily report Google Sheet.
// Admin and the general manager only. The 08:00 job writes yesterday's tab on its own; this is for
// a mid-day look at today, or filling in a day that was missed. A rerun replaces the day's tab.
export async function POST(req:Request) {
  try{const user=await businessUser(req,'/api/reports/daily');
    if(user.role!=='admin'&&user.role!=='general_manager')throw new BusinessError('التقرير اليومي متاح للإدارة فقط.',403);
    const day=new URL(req.url).searchParams.get('date')||ammanToday();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day>ammanToday())throw new BusinessError('التاريخ غير صالح.');
    const result=await publishDailyReport(day);
    return Response.json({success:true,...result});
  }catch(e){
    if(e instanceof SheetsError)return Response.json({success:false,error:e.message},{status:e.status});
    return businessFailure(e);
  }
}
