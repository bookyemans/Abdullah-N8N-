import { authenticateAdmin, json, isSameOrigin, safeText, getSupabaseConfig, supabaseRequest, supabaseApiKeyHeaders } from '../_lib/supabase.js';

export async function onRequestGet({ request, env }) {
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ ok:false, error:auth.error }, auth.status);
  if (auth.profile.role !== 'owner') return json({ ok:false, error:'owner_required' }, 403);
  try {
    const result = await supabaseRequest(env, '/rest/v1/admin_profiles?select=user_id,display_name,role,is_active,created_at,updated_at&order=created_at.asc');
    return json({ ok:true, users:result.data || [] });
  } catch { return json({ok:false,error:'users_load_failed'}, 502); }
}

export async function onRequestPost({ request, env }) {
  if (!isSameOrigin(request)) return json({ok:false,error:'origin_not_allowed'},403);
  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ok:false,error:auth.error},auth.status);
  if (auth.profile.role !== 'owner') return json({ok:false,error:'owner_required'},403);
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) return json({ok:false,error:'json_required'},415);
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > 4000) return json({ok:false,error:'request_too_large'},413);
  let raw; try { raw = await request.text(); } catch { return json({ok:false,error:'invalid_body'},400); }
  if (new TextEncoder().encode(raw).byteLength > 4000) return json({ok:false,error:'request_too_large'},413);
  let body; try { body = JSON.parse(raw); } catch { return json({ok:false,error:'invalid_json'},400); }
  const email=safeText(body.email,254).toLowerCase(), name=safeText(body.displayName,120);
  if (!['admin','owner'].includes(body.role)) return json({ok:false,error:'invalid_role'},400);
  const role=body.role;
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:'invalid_email'},400);
  let invitedUserId = null;
  let profileCreated = false;
  try {
    const cfg=await getSupabaseConfig(env);
    if (!cfg) return json({ok:false,error:'supabase_not_configured'},503);
    const invite=await fetch(`${cfg.url}/auth/v1/invite`,{method:'POST',headers:{...Object.fromEntries(supabaseApiKeyHeaders(cfg.serviceKey)), 'content-type':'application/json'},body:JSON.stringify({email})});
    const invited=await invite.json().catch(()=>({}));
    if(!invite.ok){const msg=String(invited.msg||invited.message||'');return json({ok:false,error:invite.status===422?'user_already_exists_or_invite_rejected':'invite_failed',details:msg.slice(0,180)},invite.status===429?429:422)}
    invitedUserId=invited.id || invited.user?.id;
    if(!invitedUserId)return json({ok:false,error:'invite_user_id_missing'},502);
    await supabaseRequest(env,'/rest/v1/admin_profiles',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({user_id:invitedUserId,display_name:name||email,role,is_active:true})});
    profileCreated = true;
    await supabaseRequest(env,'/rest/v1/admin_activity_logs',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_user_id:auth.user.id,action:'admin.invited',target_type:'admin_profile',target_id:invitedUserId,metadata:{role,email}})});
    return json({ok:true,userId:invitedUserId,message:'تم إرسال دعوة الإدارة. يجب على المستخدم إكمال الدعوة عبر البريد.'},201);
  } catch {
    // Compensate partial provisioning so failed profile/audit writes do not leave an orphaned invited account.
    if (invitedUserId) {
      try {
        if (profileCreated) await supabaseRequest(env,`/rest/v1/admin_profiles?user_id=eq.${encodeURIComponent(invitedUserId)}`,{method:'DELETE'});
        const cfg = await getSupabaseConfig(env);
        if (cfg) await fetch(`${cfg.url}/auth/v1/admin/users/${encodeURIComponent(invitedUserId)}`,{method:'DELETE',headers:Object.fromEntries(supabaseApiKeyHeaders(cfg.serviceKey)) });
      } catch { /* Cleanup is best-effort; operational logs should be checked if provisioning fails. */ }
    }
    return json({ok:false,error:'admin_invite_or_profile_creation_failed'},502);
  }
}
