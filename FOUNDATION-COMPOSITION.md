# Foundation website composition

Foundation Impact in the Eyivo catalog demonstrates a foundation website using the existing Theme API. This recipe is also available to sample-theme authors; it introduces no new component contract.

| Purpose | Existing component |
| --- | --- |
| Purpose and first action | `eyivo:hero` |
| Programme cards linking to detail pages | `eyivo:project_grid` |
| Approach and illustrative photography | `eyivo:image_text` |
| Public events with dates, venues and enquiry links | `eyivo:event_list` |
| Photographs with descriptions | `eyivo:media_gallery` |
| Governance responsibilities | `eyivo:team_grid` |
| Verified measures or clearly labelled demo counts | `eyivo:stats` |
| Background, reporting and policy content | `eyivo:rich_text` |
| General enquiries | `eyivo:lead_form`, using `data.form_binding: "contact"` |
| Common questions and next steps | `eyivo:faq`, `eyivo:cta` |

Create programme detail pages before publishing cards that link to them. Keep navigation labels short; explain the work in the page itself. Use registered additional menus for footer and transparency links, and render their `navigation.<key>` objects in the layout.

The `contact` binding resolves the current site's form instance. Never copy a form UUID from the public demonstration into a theme package. Event cards provide public information and links; a calendar, registration, ticketing, donation or application workflow is a separate capability.

Use the media picker and descriptive alternative text. Built-in demo imports can reuse protected images from the central shared-demo catalog. Package authors must not put object-storage credentials in a theme or write to storage from a master.

Keep demonstration organisations and unconfirmed events explicitly illustrative. Capture actual loaded demo pages for package screenshots. A theme catalog preview and a dedicated marketing-topic demo must have different site identities.

See the public documentation at <https://eyivo.com/developers/theme-api#foundation-impact> after deploying the matching Eyivo documentation update.
