# Deploy no EasyPanel via GitHub

## Configuração do Deploy

### 1. Preparação do Repositório GitHub
- Faça push de todo o código para seu repositório GitHub
- Certifique-se de que o Dockerfile e .dockerignore estão incluídos

### 2. Configuração no EasyPanel

#### Configurações Básicas:
- **Porta**: `5007`
- **Build Context**: `/`
- **Dockerfile**: `Dockerfile`

#### Build Otimizado:
O Dockerfile foi otimizado com:
- **Node.js 20 Alpine** para máxima compatibilidade e performance
- **Single-stage build** para máxima compatibilidade com EasyPanel
- **Script de entrada inteligente** (entrypoint.sh) que:
  - Detecta automaticamente se deve usar versão compilada ou TypeScript
  - Verifica se a API key do OpenAI está configurada
  - Cria diretórios necessários automaticamente
  - Fornece logs detalhados para debugging

#### Correções de Compatibilidade:
- ✅ **Erro EPR_INVALID_ARG_TYPE** corrigido (compatibilidade Node.js)
- ✅ **Health check funcional** em `/api/health`
- ✅ **Fallback automático** entre build compilado e TypeScript
- ✅ **Logs informativos** para debugging em produção

#### Variáveis de Ambiente Necessárias:
```
OPENAI_API_KEY=sua_chave_da_openai_aqui
NODE_ENV=production
PORT=5007
```

#### Health Check:
- **Path**: `/api/health`
- **Port**: `5007`
- **Interval**: `30s`
- **Timeout**: `3s`
- **Retries**: `3`

### 3. Configurações de Recursos Recomendadas:
- **CPU**: 0.5-1 core
- **Memória**: 512MB-1GB
- **Storage**: 1GB (para arquivos temporários)

### 4. Passos no EasyPanel:

1. **Conectar Repositório**:
   - Acesse EasyPanel
   - Clique em "New Project"
   - Conecte seu repositório GitHub

2. **Configurar Deploy**:
   - Source: GitHub
   - Repository: seu-usuario/nome-do-repo
   - Branch: main
   - Build Pack: Docker

3. **Definir Variáveis**:
   - Adicione `OPENAI_API_KEY`
   - Adicione `NODE_ENV=production`
   - Adicione `PORT=5007`

4. **Configurar Porta**:
   - Port: 5007
   - Protocol: HTTP

5. **Deploy**:
   - Clique em "Deploy"
   - Aguarde o build completar

### 5. Verificação:
Após o deploy, acesse:
- `https://seu-app.easypanel.io/api/health` - Deve retornar status healthy
- `https://seu-app.easypanel.io/` - Interface da aplicação

### 6. Logs e Troubleshooting:

#### Problemas Comuns:
1. **Problemas de build**:
   - O Dockerfile usa single-stage build para máxima compatibilidade
   - Todas as dependências são instaladas com `npm install`

2. **Erro de health check**:
   - Verifique se a porta 5007 está configurada corretamente
   - Confirme que `/api/health` está respondendo

3. **Problemas com OpenAI API**:
   - Verifique se `OPENAI_API_KEY` está configurada
   - Teste a chave em uma requisição manual

#### Debug:
- Acesse os logs no painel do EasyPanel
- Verifique se todas as variáveis de ambiente estão configuradas
- Confirme se a chave da OpenAI está funcionando
- Use `docker logs container-name` para debug local

## Recursos da Aplicação:
- ✅ Transcrição de áudio em português
- ✅ Suporte a MP3, WAV, M4A, OPUS
- ✅ Interface drag-and-drop
- ✅ Histórico de transcrições
- ✅ Health check para monitoramento

## Tecnologias:
- Node.js 18
- Express.js
- React + Vite
- OpenAI Whisper API
- Docker Alpine