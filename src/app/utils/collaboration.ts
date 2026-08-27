import { ProjectData } from './projectBundle';
import { supabase } from './supabase';

export type CollaborationRole = 'owner' | 'editor' | 'viewer';
export interface ProjectMember { user_id: string; email: string | null; role: CollaborationRole; }

export async function publishProject(project: ProjectData, inviteRole: 'editor' | 'viewer' = 'editor') {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Debes iniciar sesión.');
  let sharedProjectId = project.sharedProjectId;
  if (!sharedProjectId) {
    const { data, error } = await supabase.rpc('create_shared_project', {
      project_local_id: project.id,
      project_name: project.name,
      project_data: project
    });
    if (error) throw error;
    sharedProjectId = data as string;
  } else {
    const { error } = await supabase.from('shared_projects').update({ name: project.name, data: project }).eq('id', sharedProjectId);
    if (error) throw error;
  }
  const { data: invite, error: inviteError } = await supabase.from('project_invites').select('code').eq('project_id', sharedProjectId).eq('role', inviteRole).limit(1).maybeSingle();
  if (inviteError) throw inviteError;
  if (invite?.code) return { sharedProjectId, inviteCode: invite.code as string };
  const { data: newInvite, error } = await supabase.rpc('create_project_invite', {
    target_project_id: sharedProjectId,
    invite_role: inviteRole
  });
  if (error) throw error;
  return { sharedProjectId, inviteCode: newInvite as string };
}

export async function joinProject(inviteCode: string): Promise<ProjectData> {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { data, error } = await supabase.rpc('join_project_by_code', { invite_code: inviteCode.trim() });
  if (error) throw error;
  const result = data as { project_id: string; role: ProjectData['collaborationRole']; project: ProjectData };
  if (!result?.project_id || !result?.project) throw new Error('La invitación no devolvió un proyecto válido.');
  return { ...result.project, sharedProjectId: result.project_id, collaborationRole: result.role };
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('project_members').select('user_id, email, role').eq('project_id', projectId).order('created_at');
  if (error) throw error;
  return (data || []) as ProjectMember[];
}

export async function setProjectMemberRole(projectId: string, userId: string, role: CollaborationRole) {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { error } = await supabase.rpc('set_project_member_role', { target_project_id: projectId, target_user_id: userId, next_role: role });
  if (error) throw error;
}

export async function removeProjectMember(projectId: string, userId: string) {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { error } = await supabase.rpc('remove_project_member', { target_project_id: projectId, target_user_id: userId });
  if (error) throw error;
}
