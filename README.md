# SPRINT BUILD

Apresentação web estática de retrospectiva em formato de manual de montagem.

Site publicado: <https://marinellibr.github.io/sprint-retro-lego/>

## Executar

Sirva esta pasta com qualquer servidor HTTP estático e abra `index.html`. Não há build, backend, analytics ou dependência de CDN em tempo de apresentação.

Exemplo:

```sh
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`.

## Editar conteúdo

Edite apenas o arquivo `content.json`. Ele reúne todos os campos variáveis da apresentação, separados por seção. Os valores ainda não preenchidos continuam marcados entre colchetes, por exemplo `[SPRINT_NUMBER]`, `[DELIVERY_01]` e `[MAIN_LEARNING]`.

Ao abrir a apresentação, `script.js` carrega o JSON e popula automaticamente todos os elementos identificados por `data-content`. O HTML mantém os placeholders como fallback caso o arquivo não possa ser carregado.

## Modelo 3D

A entrega usa como modelo final `assets/models/kombi-orange-final.glb`: uma conversão do modelo real do set 10220, organizada em 399 etapas de montagem. A carroceria vermelha é convertida para laranja pela aplicação durante o carregamento.

Os oito macroestágios visuais estão centralizados em `CONFIG.model.macroStages`, no início de `script.js`.

O modelo pode ser girado arrastando com mouse ou toque. Com o canvas focado, as setas do teclado também alteram o ângulo; o botão “Reenquadrar” volta à pose editorial da cena.

A apresentação não usa swipe. A navegação acontece pelos botões de seta ou pelo teclado (`←`, `→`, `Espaço`, `Home` e `End`).

## GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica automaticamente o conteúdo da branch `main`. Não há etapa de build: o artefato enviado ao Pages contém os mesmos arquivos estáticos validados localmente.
