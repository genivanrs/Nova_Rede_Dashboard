# Nova Rede — Dashboard de planilhas

Página estática que lê uma planilha no navegador e monta indicadores, gráficos e tabela. Não precisa de servidor: os arquivos não saem do computador de quem abre a página.

Formatos aceitos: `.xlsx`, `.xls` e `.csv`. A primeira linha deve ser o cabeçalho. CSV exportado pelo Excel em português (separador `;` e decimal com vírgula, como `1.234,56`) também funciona.

## Abrir no seu computador

Abra `index.html` no navegador, ou sirva a pasta com um servidor local. Use **Carregar exemplo** para ver o painel sem uma planilha sua. Há um modelo em `sample/exemplo.csv`.

## Publicar de graça no GitHub Pages

1. Crie um repositório público no GitHub e envie esta pasta (incluindo `index.html`, `css/`, `js/` e `.nojekyll`).
2. No repositório, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**.
4. Em **Branch**, selecione `main` e a pasta `/ (root)`. Salve.
5. Alguns minutos depois o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

A página usa Chart.js e SheetJS por CDN, então quem acessar precisa de internet para carregar os gráficos e ler o Excel.

## Como a planilha vira painel

- Texto vira agrupamento (região, cidade, status).
- Números viram soma, média ou contagem.
- Datas montam a evolução mensal.
- Os seletores no topo trocam o recorte sem reenviar o arquivo.
- A busca filtra a tabela e os gráficos ao mesmo tempo.
