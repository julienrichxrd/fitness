// Guide : chaque notion de l'application expliquée simplement, à partir du programme.
// Les boutons « ⓘ » de l'application ouvrent l'entrée correspondante.

export const GUIDE = [
  {
    group: 'Musculation',
    items: [
      { key: 'rir', title: 'RIR : répétitions en réserve', body: [
        'Le RIR est le nombre de répétitions que vous auriez encore pu faire proprement à la fin d\'une série. RIR 3 : il en restait trois.',
        'Le programme fixe un RIR par semaine : on commence loin de l\'échec (RIR 4) pour régler les charges, puis on s\'en rapproche (RIR 1–2) quand la technique et la récupération suivent.',
        'Après une coupure, on sous-estime souvent ce qu\'il reste. En S4, une série d\'isolation à la machine poussée jusqu\'à l\'échec technique sert à recalibrer votre estimation.',
      ] },
      { key: 'double-progression', title: 'La double progression', body: [
        'Chaque exercice a une fourchette, par exemple 6–10 répétitions. Tant que vous n\'atteignez pas le haut sur toutes les séries, vous gardez la charge et ajoutez des répétitions.',
        'Quand toutes les séries atteignent le haut de la fourchette au RIR demandé, la charge monte d\'un cran et vous repartez du bas.',
        'L\'application fait ce calcul pour vous : la suggestion affichée en haut de chaque exercice dit quoi viser, et pourquoi.',
      ] },
      { key: 'suggestion', title: 'D\'où viennent les suggestions', body: [
        'Elles regardent vos deux dernières séances du même exercice, la fourchette, le RIR de la semaine, le cran de charge prévu et votre fatigue du jour.',
        'Elles ne modifient jamais rien seules : elles pré-remplissent la saisie, et vous restez libre.',
        'Fatigue 4 ou 5 : aucune augmentation n\'est proposée ce jour-là.',
        'Si l\'écart de charge dépasse 10 % (petits haltères, poulies), deux options sont proposées : monter, ou ajouter des répétitions au-delà de la fourchette.',
      ] },
      { key: 'superset', title: 'Supersérie', body: [
        'Deux exercices enchaînés sans repos (5a puis 5b), puis un seul repos après le tour. On gagne du temps sans perdre en qualité, car les deux exercices sollicitent des muscles différents.',
        'L\'application passe seule de l\'un à l\'autre et lance le repos au bon moment.',
      ] },
      { key: 'fallback', title: 'Repli des tractions', body: [
        'Sous 6 répétitions au RIR demandé, on termine les séries restantes au tirage vertical ou aux tractions assistées. On garde ainsi le bon volume au lieu de faire des séries trop courtes.',
        'Quand toutes les séries atteignent 10 répétitions, on ajoute un lest de 2,5 kg.',
      ] },
      { key: 'warmup', title: 'Échauffement', body: [
        '5 minutes de cardio léger, puis la mobilité du jour.',
        'Premier exercice : 8 répétitions à ~50 %, 5 à ~70 %, 2–3 à ~85 % de la charge de travail. Deuxième exercice : une série de 6 à ~60 % s\'il sollicite d\'autres articulations.',
      ] },
      { key: 'rest', title: 'Chronomètre de repos', body: [
        'Il démarre seul après chaque série et reste juste même si l\'écran se verrouille : il est calculé à partir de l\'heure de fin.',
        'Une sonnerie retentit à la fin si l\'application est à l\'écran. Sur iPhone, aucune alerte ne peut s\'afficher quand l\'écran est verrouillé.',
      ] },
    ],
  },
  {
    group: 'Récupération et cycle',
    items: [
      { key: 'weekly-review', title: 'Le bilan de fin de semaine', body: [
        'Chaque week-end, l\'application regarde quatre signaux : fatigue moyenne de 4 ou 5, courbatures fortes qui persistent, performances en baisse sur au moins 2 exercices, douleur qui revient.',
        'Aucun signal : semaine suivante. Un signal : on refait les réglages de la semaine (le cycle se décale d\'une semaine). Deux ou plus : semaine de décharge.',
        'C\'est vous qui décidez : l\'application pré-coche ce qu\'elle a mesuré et propose.',
      ] },
      { key: 'deload', title: 'Semaine de décharge', body: [
        'Moitié des séries, mêmes charges, RIR 3–4. Course et natation faciles.',
        'Ce n\'est pas un recul : la fatigue accumulée se dissipe et la progression reprend ensuite plus vite.',
      ] },
      { key: 'checkin', title: 'Le ressenti du matin', body: [
        'Moins d\'une minute : heures de sommeil, puis qualité, fatigue, courbatures et motivation de 1 à 5. Fréquence cardiaque au repos si la montre la donne.',
        'Nuit de moins de 6 h : RIR +1 et sans la dernière série des polyarticulaires. Fatigue 4–5 : une série de moins par exercice, RIR +1.',
        'Une hausse de plus de ~5 battements par minute au repos sur plusieurs jours est un signal de fatigue.',
      ] },
      { key: 'pain', title: 'Courbature ou douleur ?', body: [
        'Une courbature est diffuse, dans le muscle, et diminue en s\'échauffant. Une douleur est localisée, souvent articulaire ou tendineuse, et augmente avec l\'effort.',
        'Douleur inhabituelle : arrêter l\'exercice, passer à une alternative indolore. Plus de 7 jours, gonflement, douleur la nuit ou fourmillements : médecin ou kinésithérapeute.',
        'Douleur thoracique, malaise, essoufflement anormal : arrêter tout effort et demander un avis médical rapide.',
      ] },
    ],
  },
  {
    group: 'Corps',
    items: [
      { key: 'weight-trend', title: 'Lire son poids', body: [
        'Le poids varie de 1 à 2 kg d\'un jour à l\'autre (eau, sel, glucides, transit). Une valeur seule ne veut rien dire.',
        'Pesez-vous 3 matins par semaine, au réveil, après les toilettes, avant de manger ou boire. La courbe épaisse est la moyenne des 7 derniers jours : c\'est elle qu\'on lit.',
        'Repère pour prendre du muscle en restant sec : environ +0,1 à +0,25 kg par semaine.',
      ] },
      { key: 'measurements', title: 'Mensurations', body: [
        'En semaine 1 puis en fin de cycle, au réveil, toujours du même côté avec le même mètre ruban.',
        'Taille : au nombril, en fin d\'expiration normale. Poitrine : au niveau des mamelons. Bras : relâché, au plus gros. Cuisse : à mi-distance hanche-genou.',
        'Un tour de taille stable avec des bras et une poitrine qui montent : c\'est exactement ce qu\'on cherche.',
      ] },
      { key: 'photos', title: 'Photos de suivi', body: [
        'Face, profil, dos. Même lieu, même lumière, même distance, même heure, posture relâchée.',
        'Elles restent uniquement sur cet iPhone. Elles ne sont dans la sauvegarde que si vous le choisissez.',
        'Les comparaisons restent prudentes : un changement de lumière ou de posture se voit plus qu\'un mois d\'entraînement.',
      ] },
    ],
  },
  {
    group: 'Nutrition',
    items: [
      { key: 'calories', title: 'Calories : une estimation de départ', body: [
        'La dépense est estimée avec la formule de Mifflin-St Jeor, multipliée par votre niveau d\'activité, plus environ 150 kcal pour construire du muscle sans trop gonfler.',
        'C\'est un point de départ, pas une mesure : la tendance du poids sur 2 à 3 semaines dit s\'il faut ajuster, par pas de 150 à 200 kcal.',
      ] },
      { key: 'protein', title: 'Protéines', body: [
        'Cible : environ 1,8 g par kilo de poids de corps et par jour (la fourchette utile va de 1,6 à 2,2 g).',
        'Répartir sur les 3 repas aide : 30 à 50 g par repas. Skyr, viandes, œufs, thon, légumineuses et produits laitiers suffisent ; les compléments ne sont pas indispensables.',
      ] },
      { key: 'recipes', title: 'Recettes de meal prep', body: [
        'Enregistrez une préparation une fois (ingrédients pesés crus ou cuits, nombre de portions). Ensuite, une portion s\'ajoute en un geste.',
        'Pesez de la même façon que la base d\'aliments : « riz cuit » se compte cuit, « riz cru » se compte cru.',
      ] },
      { key: 'social', title: 'Restaurants et sorties', body: [
        'Un repas au restaurant se note avec une estimation : c\'est mieux qu\'un trou dans le journal.',
        'Pas de compensation le lendemain : c\'est la moyenne de la semaine qui compte.',
      ] },
    ],
  },
  {
    group: 'Endurance',
    items: [
      { key: 'easy-run', title: 'Course facile', body: [
        'Vous pouvez parler en phrases complètes : effort 3–4 sur 10. Si vous devez couper vos phrases pour respirer, ralentissez, quitte à marcher en côte.',
        'L\'allure sera nettement plus lente que celle de votre 10 km : c\'est voulu. Le but est de construire l\'endurance sans voler la récupération des jambes.',
      ] },
      { key: 'strides', title: 'Accélérations', body: [
        'En fin de sortie, sur terrain plat : montez progressivement jusqu\'à une allure rapide mais relâchée, sans sprint, pendant 15 s. 1 min de trottinement entre chaque.',
      ] },
      { key: 'swim', title: 'Respirer en crawl', body: [
        'L\'essoufflement vient surtout d\'une expiration incomplète : on garde de l\'air et on n\'a pas le temps d\'inspirer.',
        'Expirez doucement et en continu sous l\'eau, puis tournez la tête sur le côté, une lunette dans l\'eau, pour inspirer vite.',
        'Sécurité : aucune apnée prolongée, aucune hyperventilation. Nagez seulement en présence d\'un surveillant.',
      ] },
      { key: 'suunto', title: 'Importer une séance de la montre', body: [
        'Dans l\'application Suunto, ouvrez l\'activité, puis partagez ou exportez le fichier (formats .fit ou .gpx). Enregistrez-le dans Fichiers.',
        'Ici : Journal → Ajouter → Course ou Natation → Importer un fichier de montre. Durée, distance et fréquence cardiaque sont lues dans le fichier, qui reste sur l\'iPhone.',
      ] },
    ],
  },
  {
    group: 'Vos données',
    items: [
      { key: 'privacy', title: 'Où sont vos données', body: [
        'Uniquement sur cet appareil, dans le stockage de l\'application. Aucun compte, aucun serveur, aucun envoi automatique.',
        'Ce stockage n\'est pas une sauvegarde : il disparaît si l\'icône est supprimée ou si les données de Safari sont effacées.',
      ] },
      { key: 'backup', title: 'Sauvegarder', body: [
        'Plus → Sauvegarder crée un fichier avec toutes vos données. Enregistrez-le dans Fichiers, puis copiez-le sur le PC (LocalSend, sans internet).',
        'Chaque dimanche, et après chaque bilan. Gardez les 8 dernières et celle de chaque fin de cycle.',
      ] },
      { key: 'review-export', title: 'Le bilan pour Claude', body: [
        'Plus → Bilan pour Claude crée un fichier résumé de la période : séances, charges, poids, mensurations, récupération, endurance, nutrition. Il ne contient ni nom ni coordonnées.',
        'Envoyez-le dans une conversation avec Claude avec le message proposé : l\'analyse et le cycle suivant reviennent sous forme de texte ou d\'un nouveau fichier programme à importer.',
      ] },
    ],
  },
];

export const guideEntry = (key) => GUIDE.flatMap((g) => g.items).find((i) => i.key === key) || null;
