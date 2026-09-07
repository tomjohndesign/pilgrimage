# Wildlife motion references

Research checked 6 September 2026. These sources guide the contact order and
silhouettes. The exact phase offsets, durations and population activity budgets
in the game are authored animation choices, not measurements of wild animals.

- [University of Minnesota veterinary gait demonstrations](https://vanat.ahc.umn.edu/gaits/):
  the [walk](https://vanat.ahc.umn.edu/gaits/walk.html) uses four sequential contacts;
  the [trot](https://vanat.ahc.umn.edu/gaits/trot.html) pairs diagonal limbs and keeps
  the trunk relatively steady; the [canter](https://vanat.ahc.umn.edu/gaits/canter.html)
  is a hind, diagonal, fore sequence. This informs the fox's dog-like trot and lope.
- [Dagg, Gaits in mammals, 1973](https://originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/03/Dagg_1973_Gaits-in-mammals.pdf):
  comparative observations distinguish cervid walking, trotting, galloping and
  leaping. The deer normally walk, canter across open ground and gallop when
  alarmed, with occasional separate leaps rather than a repeated four-foot bounce.
- [Hall et al., Rabbit hindlimb kinematics, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9208372/):
  synchronized hindlimb propulsion distinguishes rabbit bounds and half-bounds.
  [Lagomorpha as a Model Morphological System](https://www.frontiersin.org/journals/ecology-and-evolution/articles/10.3389/fevo.2021.636402/full)
  describes lumbar flexion during recovery. The rabbit animation uses paired
  hindfeet, staggered forefeet, an arched back and longer hindfeet.
- [University of Michigan, European rabbit](https://animaldiversity.org/accounts/Oryctolagus_cuniculus/):
  burrowing rabbits use warrens. The game's rabbits approach a persistent opening,
  enter below its lip, remain underground and emerge from that same opening.
- [Sheep locomotor study, 1999](https://journals.physiology.org/doi/full/10.1152/jappl.1999.87.5.1887):
  walking differs from diagonal trotting and suspended galloping. Sheep here use a
  slow walk with long support periods, remaining with their grazing flock.
- [Goat gait walkway measurements, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6795426/)
  and [goat grazing activity, 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC9371207/):
  walking, feeding and resting are distinct activities. Goats take short walks
  between long feeding periods, as requested; goats also browse in real life.
- [Free-roaming wild boar behavior, 2020](https://pmc.ncbi.nlm.nih.gov/articles/PMC7680034/)
  informs the walking, rooting and resting behavior. Boars use grounded walks
  and trots; the wallow action has been removed.
- [Cornell Lab, Eurasian Tree Sparrow](https://www.allaboutbirds.org/guide/Eurasian_Tree_Sparrow/lifehistory):
  tree cavities provide nest and roost sites, with birds entering and leaving.
  The small birds use tree cover as shelter; hawks use larger canopy perches and
  longer overhead flights. Wings fold progressively on arrival.

`gait.ts` contains the contact schedules, shared foot-target curves and fixed-bone
IK. `rig.ts` deforms the connected hide over that pose. `simulation.ts` selects
activities and derives world speed from the rendered stride and edited cadence.
The playground exposes only the actions supported by the selected species.
Saved timing and pose keys live in `rig-edits.ts` / `rig-store.ts`.

Grazing neck and skull articulation also uses the [WWF red deer feeding photograph](https://www.pandaclub.ch/it/tier/cervo/) as a visual reference: an anchored shoulder, lowered neck, and independently pitched skull with the muzzle at the grass.

## Form and rig construction

The mammal form pass uses explicit standing landmarks in `anatomy.ts`: pelvis, rib cage, shoulder/scapula, cervical attachment, poll, skull/muzzle, and the four limb chains. Each species supplies its own cross sections and limb lengths. The same connected axial hide and limb sleeves appear in both Coat and Construction views. The playground opens these mammals standing and paused; gait choreography remains a separate pass.

Visual references inspected for this pass:

- [Red fox side profile, photographer Malene Thyssen](https://commons.wikimedia.org/wiki/File:Fuchs_Profil.jpg): chest depth, waist tuck, cheek and throat colour, hind-limb fold and tail volume.
- [Wild boar side profile, photographer Ralf Kistowski](https://wunderbare-erde.de/o20620-massiger%20K%C3%B6rperbau...%20Wildschwein%20%2ASus%20scrofa%2A%20nimmt%20Witterung%20auf): shoulder-heavy body, short neck, long wedge-shaped head and lower legs.
- [Austrian goat breeders’ breed photographs](https://www.ziegenland.com/zucht/ziegenrassen): goat body depth, neck, head and limb proportions.
- [Royal Veterinary College anatomy resources](https://www.rvc.ac.uk/e-anatomy) and [rabbit limb illustration from Thomson, hosted by University of South Florida](https://etc.usf.edu/clipart/48100/48120/48120_rabbit_limbs.htm): scapula and forelimb/hindlimb chain distinctions.

Horse and donkey rigs are outside this form pass.

The flight follow-up adds a separate wrist under each wing, eased shoulder motion, and a held Glide clip for both birds. [Cornell’s Red-tailed Hawk account](https://www.allaboutbirds.org/guide/Red-tailed_Hawk/id) describes alternating heavy wingbeats with gliding and soaring. The hawk uses longer cruise glides; sparrow glides are brief, authored transitions between flapping intervals. These timings are animation choices, not measured species constants. `burrow-motion.ts` shares the rabbit’s entrance direction, tunnel travel, ear fold and exit with the map and preview; the rabbit turns around while concealed.
