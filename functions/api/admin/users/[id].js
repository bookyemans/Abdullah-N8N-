import { authenticateAdmin, json, isSameOrigin, safeText, supabaseRequest } from '../../_lib/supabase.js';

export async function onRequestPatch({request,env,params}) {
  if(!isSameOrigin(request))return json({ok:false,error:'origin_not_allowed'},403);
  const auth=await authenticateAdmin(request,env); if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
  if(auth.profile.role!=='owner')return json({ok:false,error:'owner_required'},403);
  const id=safeText(params.id,80); if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,error:'invalid_user_id'},400);
  if(!request.headers.get('content-type')?.includes('application/json'))return json({ok:false,error:'json_required'},415);
  const declaredLength=Number(request.headers.get('content-length')||0); if(declaredLength>4000)return json({ok:false,error:'request_too_large'},413);
  let raw;try{raw=await request.text()}catch{return json({ok:false,error:'invalid_body'},400)}
  if(new TextEncoder().encode(raw).byteLength>4000)return json({ok:false,error:'request_too_large'},413);
  let body;try{body=JSON.parse(raw)}catch{return json({ok:false,error:'invalid_json'},400)}
  const changes={}; if(typeof body.isActive==='boolean')changes.is_active=body.isActive;
  if(['admin','owner'].includes(body.role))changes.role=body.role;
  if(body.displayName!==undefined)changes.display_name=safeText(body.displayName,120);
  if(!Object.keys(changes).length)return json({ok:false,error:'no_valid_changes'},400);
  try{
    const current=await supabaseRequest(env,`/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(id)}&select=user_id,role,is_active&limit=1`);
    const row=current.data?.[0]; if(!row)return json({ok:false,error:'admin_not_found'},404);
    if(id===auth.user.id && changes.is_active===false)return json({ok:false,error:'cannot_deactivate_self'},409);
    if(row.role==='owner' && (changes.role==='admin'||changes.is_active===false)){
      const owners=await supabaseRequest(env,'/rest/v1/admin_profiles?role=eq.owner&is_active=eq.true&select=user_id');
      if((owners.data||[]).length<=1)return json({ok:false,error:'cannot_remove_last_active_owner'},409);
    }
    await supabaseRequest(env,`/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify(changes)});
    await supabaseRequest(env,'/rest/v1/admin_activity_logs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_user_id:auth.user.id,action:'admin.updated',target_type:'admin_profile',target_id:id,metadata:{changed_fields:Object.keys(changes),...('role'in changes?{role:changes.role}:{}),...('is_active'in changes?{is_active:changes.is_active}:{})}})});
    return json({ok:true,message:'تم تحديث حساب الإدارة.'});
  }catch{return json({ok:false,error:'admin_update_failed'},502)}
}
