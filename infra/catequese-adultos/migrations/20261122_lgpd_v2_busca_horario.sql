-- NÃO APLICAR daqui. Sem CI, sem wrangler, sem mensagem.
-- Rodar à mão no SQL editor (aica-prod) ANTES de `npx wrangler deploy -c wrangler.jsonc`.
--
-- Ordem: 1) este arquivo  2) deploy do Worker, só com GO escrito  3) desativar lgpd-v1 (última seção, comentada).
--
-- O que faz (tudo aditivo, uma transação; se algo falhar, nada é aplicado):
--   * ativa o consentimento lgpd-v2 (finalidade catequese_adultos) em interno.consent_versions;
--     lgpd-v1 continua ativa, para o Worker antigo e abas abertas seguirem gravando até o deploy;
--   * duas colunas novas, nulas nas inscrições já gravadas: busca e horario (opção B);
--   * restrição NOT VALID: vale para linhas novas, não olha nem altera as antigas;
--   * troca a assinatura da RPC public.catequese_adultos_inscrever: dois argumentos novos no fim,
--     com default. Chamador antigo continua funcionando. A RPC também aplica a regra do batismo.
-- NÃO faz UPDATE nem DELETE em inscrição. Colunas msg_optin* e a finalidade
-- catequese_adultos_mensagens ficam como estão: são o registro do que cada inscrito antigo aceitou.
--
-- Pressupostos sobre interno.consent_versions (você só me passou estas colunas):
--   finalidade, versao, ativo, vigente_desde e texto_hash (sha256 hex do texto do consentimento).
--   Se existir outra coluna NOT NULL sem default, o INSERT falha e a transação inteira é desfeita.
--   Se a coluna do hash tiver outro nome, ajuste só o INSERT abaixo.
--
-- Texto lgpd-v2 (UTF-8, exatamente como no index.html, sem o rótulo "Versão do texto"):
--   Autorizo a Comdei (associação em constituição) a guardar estes dados, inclusive a informação sobre
--   sacramentos, o que procuro na catequese e o horário que prefiro para os encontros, e a falar comigo por
--   WhatsApp e e-mail sobre a catequese de adultos: confirmação da inscrição, formação da turma e avisos dos
--   encontros. Os dados não são compartilhados nem usados para outro fim. Posso pedir para ver, corrigir ou
--   apagar meus dados, ou para parar de receber mensagens, a qualquer momento: respondendo SAIR ou escrevendo
--   para lucas@comdei.org.
-- sha256 = 6d95f26ad75539f3fc3d7e45941d06b272470ff32ad8740b7b6410f3b601a4fa
-- (o teste catequese-adultos-espera.test.mjs confere que este hash bate com o texto do index.html)

begin;

insert into interno.consent_versions (finalidade, versao, ativo, vigente_desde, texto_hash)
select 'catequese_adultos', 'lgpd-v2', true, now(),
       '6d95f26ad75539f3fc3d7e45941d06b272470ff32ad8740b7b6410f3b601a4fa'
where not exists (
  select 1 from interno.consent_versions where finalidade = 'catequese_adultos' and versao = 'lgpd-v2');

alter table interno.catequese_adultos_espera
  add column if not exists busca text,
  add column if not exists horario text;

alter table interno.catequese_adultos_espera drop constraint if exists cae_busca_ck;
alter table interno.catequese_adultos_espera
  add constraint cae_busca_ck check (busca is null or busca in ('batismo','primeira_comunhao','crisma','nao_sei')) not valid;

alter table interno.catequese_adultos_espera drop constraint if exists cae_horario_ck;
alter table interno.catequese_adultos_espera
  add constraint cae_horario_ck check (horario is null or horario in ('manha','tarde','noite','fim_semana')) not valid;

-- Regra do batismo no banco: "não batizado" nunca com primeira comunhão feita.
-- NOT VALID: só vale para linhas novas; inscrições antigas inconsistentes ficam como estão (sem UPDATE).
alter table interno.catequese_adultos_espera drop constraint if exists cae_batismo_comunhao_ck;
alter table interno.catequese_adultos_espera
  add constraint cae_batismo_comunhao_ck check (batizado is distinct from 'nao' or primeira_comunhao = 'nao') not valid;

drop function if exists public.catequese_adultos_inscrever(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, boolean, text, timestamptz
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
  p_aviso_privacidade_aceito_em timestamptz default null,
  p_busca text default null,
  p_horario text default null
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
  v_busca  text := nullif(btrim(coalesce(p_busca,'')), '');
  v_horario text := nullif(btrim(coalesce(p_horario,'')), '');
  v_pc     text := p_primeira_comunhao;
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
  if p_batizado = 'nao' then null; -- comunhão será 'nao' (ver abaixo)
  elsif p_primeira_comunhao is null or p_primeira_comunhao not in ('sim','nao','nao_sei') then
    raise exception using errcode = '22023', message = 'invalido:primeira_comunhao'; end if;
  -- regra do batismo (a mesma do Worker): não batizado não fez a primeira comunhão
  if p_batizado = 'nao' then v_pc := 'nao'; end if;
  if v_busca is not null and v_busca not in ('batismo','primeira_comunhao','crisma','nao_sei') then
    raise exception using errcode = '22023', message = 'invalido:busca'; end if;
  if v_horario is not null and v_horario not in ('manha','tarde','noite','fim_semana') then
    raise exception using errcode = '22023', message = 'invalido:horario'; end if;
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
     busca, horario, maior_18, consent_version, utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip_hash,
     msg_optin, msg_optin_finalidade, msg_optin_version, msg_optin_at,
     aviso_privacidade_versao, aviso_privacidade_aceito_em)
  values
    (v_nome, p_whatsapp, v_bairro, v_email, p_batizado, v_pc, v_cs, v_outro,
     v_busca, v_horario, true, p_consent_version,
     left(nullif(btrim(coalesce(p_utm_source,'')),''),200), left(nullif(btrim(coalesce(p_utm_medium,'')),''),200),
     left(nullif(btrim(coalesce(p_utm_campaign,'')),''),200), left(nullif(btrim(coalesce(p_utm_content,'')),''),200),
     left(nullif(btrim(coalesce(p_utm_term,'')),''),200), left(nullif(btrim(coalesce(p_referrer,'')),''),300),
     p_ip_hash,
     v_optin, case when v_optin then 'catequese_adultos_mensagens' end, v_ov, case when v_optin then now() end,
     v_aviso, p_aviso_privacidade_aceito_em);
  return jsonb_build_object('ok', true, 'duplicado', false);
end $function$;

revoke all on function public.catequese_adultos_inscrever(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, boolean, text, timestamptz, text, text
) from public, anon, authenticated;

grant execute on function public.catequese_adultos_inscrever(
  text, text, text, text, text, boolean, text, text, text, text, text, text, text, text, text, text, text, boolean, text, timestamptz, text, text
) to service_role;

commit;

-- Depois do deploy do Worker novo (passo 3), à mão, e só quando não houver mais aba antiga enviando lgpd-v1:
-- update interno.consent_versions set ativo = false where finalidade = 'catequese_adultos' and versao = 'lgpd-v1';
--
-- Rollback do banco (se precisar voltar ao Worker anterior, que manda lgpd-v1): reativar lgpd-v1 acima com
-- ativo = true. As colunas novas e a RPC nova são compatíveis com o Worker antigo.
