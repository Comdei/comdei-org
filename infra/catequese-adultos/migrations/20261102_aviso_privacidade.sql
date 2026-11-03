-- NÃO APLICAR daqui. Sem CI, sem wrangler, sem mensagem.
-- Rodar à mão no SQL editor ANTES de `npx wrangler deploy -c wrangler.jsonc`.
-- Aditiva: duas colunas novas, nulas nas inscrições já gravadas.
-- Não há UPDATE nem reenvio. A mensagem de WhatsApp não sai deste arquivo.
--
-- PROVISIONAL: o aviso na página ainda espera o OK do Lucas.
-- Versão gravada na inscrição: aviso-privacidade-v0.
-- O catálogo interno.consent_versions só aceita versões lgpd-vN, então este aviso
-- fica na própria inscrição e não entra nesse catálogo.

alter table interno.catequese_adultos_espera
  add column if not exists aviso_privacidade_versao text,
  add column if not exists aviso_privacidade_aceito_em timestamptz;

alter table interno.catequese_adultos_espera
  drop constraint if exists cae_aviso_privacidade_ck;

alter table interno.catequese_adultos_espera
  add constraint cae_aviso_privacidade_ck check (
    (aviso_privacidade_versao is null and aviso_privacidade_aceito_em is null)
    or (
      aviso_privacidade_versao ~ '^aviso-privacidade-v[0-9]+$'
      and aviso_privacidade_aceito_em is not null
    )
  );

-- Troca a assinatura. Argumentos novos no fim, com default, para um chamador antigo
-- continuar inserindo (as colunas novas ficam nulas). O Worker novo sempre manda os dois.
drop function if exists public.catequese_adultos_inscrever(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, boolean
);

create function public.catequese_adultos_inscrever(
  p_nome text,
  p_whatsapp text,
  p_bairro_cidade text,
  p_batizado text,
  p_primeira_comunhao text,
  p_maior_18 boolean,
  p_consent_version text,
  p_ip_hash text,
  p_email text default null,
  p_como_soube text default null,
  p_como_soube_outro text default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_referrer text default null,
  p_msg_optin boolean default false,
  p_aviso_privacidade_versao text default null,
  p_aviso_privacidade_aceito_em timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_nome   text := btrim(p_nome);
  v_bairro text := btrim(p_bairro_cidade);
  v_email  text := nullif(lower(btrim(coalesce(p_email,''))), '');
  v_outro  text := nullif(btrim(coalesce(p_como_soube_outro,'')), '');
  v_cs     text := nullif(btrim(coalesce(p_como_soube,'')), '');
  v_optin  boolean := coalesce(p_msg_optin, false);
  v_aviso  text := nullif(btrim(coalesce(p_aviso_privacidade_versao,'')), '');
  v_ov     text;
  n_recent integer;
begin
  if v_nome is null or char_length(v_nome) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalido:nome'; end if;
  if p_whatsapp is null or p_whatsapp !~ '^\+55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$' then
    raise exception using errcode = '22023', message = 'invalido:whatsapp'; end if;
  if v_bairro is null or char_length(v_bairro) not between 2 and 120 then
    raise exception using errcode = '22023', message = 'invalido:bairro_cidade'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception using errcode = '22023', message = 'invalido:email'; end if;
  if p_batizado is null or p_batizado not in ('sim','nao','nao_sei') then
    raise exception using errcode = '22023', message = 'invalido:batizado'; end if;
  if p_primeira_comunhao is null or p_primeira_comunhao not in ('sim','nao','nao_sei') then
    raise exception using errcode = '22023', message = 'invalido:primeira_comunhao'; end if;
  if v_cs is not null and v_cs not in ('missa','irmandade','amigo_familia','whatsapp','instagram','facebook','cartaz','site','outro') then
    raise exception using errcode = '22023', message = 'invalido:como_soube'; end if;
  if v_cs is distinct from 'outro' then v_outro := null;
  elsif v_outro is null then raise exception using errcode = '22023', message = 'invalido:como_soube_outro'; end if;
  if p_maior_18 is not true then
    raise exception using errcode = '22023', message = 'invalido:maior_18'; end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalido:ip_hash'; end if;
  if p_consent_version is null or not exists (
       select 1 from interno.consent_versions
       where finalidade = 'catequese_adultos' and versao = p_consent_version and ativo) then
    raise exception using errcode = '22023', message = 'invalido:consent_version'; end if;
  if v_aviso is not null or p_aviso_privacidade_aceito_em is not null then
    if v_aviso is null or v_aviso !~ '^aviso-privacidade-v[0-9]+$' then
      raise exception using errcode = '22023', message = 'invalido:aviso_privacidade_versao'; end if;
    if p_aviso_privacidade_aceito_em is null then
      raise exception using errcode = '22023', message = 'invalido:aviso_privacidade_aceito_em'; end if;
  end if;

  -- versão vigente do texto de mensagens: decidida aqui, nunca pelo cliente
  if v_optin then
    select versao into v_ov from interno.consent_versions
     where finalidade = 'catequese_adultos_mensagens' and ativo
     order by vigente_desde desc, versao desc limit 1;
    if v_ov is null then raise exception using errcode = '22023', message = 'invalido:msg_optin'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catequese_adultos:' || p_ip_hash, 0));
  select count(*) into n_recent from interno.catequese_adultos_espera
   where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes';
  if n_recent >= 5 then
    raise exception using errcode = 'PT429', message = 'muitas_tentativas';
  end if;

  if exists (select 1 from interno.catequese_adultos_espera
              where whatsapp = p_whatsapp and created_at > now() - interval '24 hours') then
    return jsonb_build_object('ok', true, 'duplicado', true);
  end if;

  insert into interno.catequese_adultos_espera
    (nome, whatsapp, bairro_cidade, email, batizado, primeira_comunhao, como_soube, como_soube_outro,
     maior_18, consent_version, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip_hash,
     msg_optin, msg_optin_finalidade, msg_optin_version, msg_optin_at,
     aviso_privacidade_versao, aviso_privacidade_aceito_em)
  values
    (v_nome, p_whatsapp, v_bairro, v_email, p_batizado, p_primeira_comunhao, v_cs, v_outro,
     true, p_consent_version,
     left(nullif(btrim(coalesce(p_utm_source,'')),''),200), left(nullif(btrim(coalesce(p_utm_medium,'')),''),200),
     left(nullif(btrim(coalesce(p_utm_campaign,'')),''),200), left(nullif(btrim(coalesce(p_utm_content,'')),''),200),
     left(nullif(btrim(coalesce(p_utm_term,'')),''),200), left(nullif(btrim(coalesce(p_referrer,'')),''),300),
     p_ip_hash,
     v_optin, case when v_optin then 'catequese_adultos_mensagens' end, v_ov, case when v_optin then now() end,
     v_aviso, p_aviso_privacidade_aceito_em);
  return jsonb_build_object('ok', true, 'duplicado', false);
end $function$;

revoke all on function public.catequese_adultos_inscrever(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, boolean, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.catequese_adultos_inscrever(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, boolean, text, timestamptz
) to service_role;
