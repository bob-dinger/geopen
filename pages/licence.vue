<template>
  <div>
    <SiteHeader />
    <main class="wrap doc">
      <h1>Licence</h1>

      <p class="lead">
        Take it. You don't have to credit us, ask us, or tell us.
      </p>

      <h2 class="mono">The short version</h2>
      <p>
        Everything we derive — the assembled datasets, the classifications, the geocoding,
        the verification flags — is released under
        <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noopener">CC0 1.0</a>,
        which places it in the public domain. Use it commercially, republish it, build a
        product on it, train a model on it. No attribution required.
      </p>

      <h2 class="mono">Why no attribution</h2>
      <p>
        Most of what's here is public record that we collected rather than created. Facts
        about who owns a parcel or where an aquifer sits aren't ours to license, and asserting
        rights over them would be dishonest.
      </p>
      <p>
        Attribution requirements also make data harder to use. Combine forty sources and a
        dozen attribution clauses becomes an obligation to track forever — so people quietly
        drop the datasets that impose it. We would rather be used.
      </p>
      <p>
        If you do want to credit us, <span class="mono">geopen.io</span> is enough. Every file
        we serve carries its source, licence and retrieval date inside the download, so it can
        explain itself long after it leaves here.
      </p>

      <h2 class="mono">What CC0 does not cover</h2>
      <p>
        We can only license what we made. Source material keeps its own terms, and some of it
        is more restrictive than we are. Satellite imagery from ESRI's Wayback archive, for
        one, is free for non-commercial use only.
      </p>
      <p>
        Each dataset page names its source. <strong>If you are doing something commercial and
        the underlying data matters, check the source before relying on it.</strong> Our
        licence covers our work, not theirs.
      </p>

      <h2 class="mono">Per-dataset terms</h2>
      <p>
        A dataset can carry its own licence where a source requires it, or where the work is
        genuinely authored rather than gathered. Where that applies, the dataset page and the
        download both say so. Everything else is CC0.
      </p>

      <h2 class="mono">The code</h2>
      <p>
        The application is MIT licensed and lives at
        <a href="https://github.com/bob-dinger/geopen" rel="noopener">github.com/bob-dinger/geopen</a>.
      </p>

      <p class="foot-note">
        None of this is legal advice, and we are not lawyers. If your use is high-stakes,
        read <a href="https://creativecommons.org/publicdomain/zero/1.0/legalcode" rel="noopener">the
        CC0 legal text</a> and check the source yourself.
      </p>
    </main>
  </div>
</template>

<script setup lang="ts">
const cfg = useRuntimeConfig()
useHead({
  title: 'Licence — geopen.io',
  meta: [{ name: 'description', content:
    'Everything geopen.io derives is released CC0 — public domain, no attribution required. ' +
    'Source materials keep their own terms, noted per dataset.' }],
  link: [{ rel: 'canonical', href: `${cfg.public.siteUrl}/licence` }],
})
</script>

<style scoped>
.doc { max-width: 660px; padding: 56px 24px 80px; display: grid; gap: 16px; }
h1 { font-family: var(--mono); font-size: 34px; font-weight: 600; letter-spacing: -.035em; }
.lead { font-size: 20px; color: var(--ink); max-width: 30ch; }
h2 { font-size: 12px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
     color: var(--ink-2); margin-top: 22px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
p { color: var(--ink-2); }
p strong { color: var(--ink); font-weight: 600; }
a { color: var(--accent); }
.foot-note { font-size: 13px; color: var(--ink-3); margin-top: 26px;
             padding-top: 14px; border-top: 1px solid var(--rule-2); }
</style>
