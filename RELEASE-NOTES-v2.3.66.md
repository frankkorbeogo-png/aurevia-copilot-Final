# AUREVIA COPILOT V2.3.66 — fiabilisation M15 et calendrier TradingView

- Le flux M15 dispose désormais de trois tentatives côté client en cas d’erreur transitoire (408/425/5xx), avec temporisation progressive. Les réponses 429 restent soumises au cooldown et aucune donnée périmée n’est transformée en signal.
- Les autres unités techniques bénéficient de deux tentatives. La décision et les niveaux restent exclusivement fondés sur M15.
- Le calendrier de la page est simplifié : widget TradingView directement visible, thème sombre, langue française, sans filtre limité aux seuls États-Unis ni chargement préalable d’un fournisseur secondaire.
- Cache PWA versionné en v2.3.66.

Cette version a été préparée et testée localement. Elle n’est pas considérée comme déployée tant que le déploiement Netlify n’a pas été publié et vérifié.
