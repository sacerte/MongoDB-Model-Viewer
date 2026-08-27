import { supabase } from './supabase';
export const PERMISSION_KEYS = ['diagram','indexes','dictionary','schema','documentation','projects','importExport','collaboration','editContent','settings'] as const;
export type PermissionKey = typeof PERMISSION_KEYS[number];
export type AppPermissions = Record<PermissionKey, boolean>;
export const defaultPermissions: AppPermissions = { diagram:true,indexes:true,dictionary:true,schema:true,documentation:true,projects:true,importExport:true,collaboration:false,editContent:false,settings:false };
export interface AppUser { user_id:string; email:string; is_admin:boolean; permissions:AppPermissions; }
export async function getMyPermissions(){ const {data,error}=await supabase!.rpc('get_my_app_permissions'); if(error) throw error; return data as {is_admin:boolean;permissions:AppPermissions}; }
export async function listAppUsers(){ const {data,error}=await supabase!.rpc('list_app_users'); if(error) throw error; return (data||[]) as AppUser[]; }
export async function saveAppUser(user:AppUser){ const {error}=await supabase!.rpc('set_app_user_permissions',{target_user_id:user.user_id,target_is_admin:user.is_admin,target_permissions:user.permissions}); if(error) throw error; }
