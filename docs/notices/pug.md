# Cautions for Pug

1. interpolation

do not use `#{}` in the url like

```pug
#story-output(
  hx-ext='sse'
  sse-connect=/api/stream/rooms/#{roomId}/stream'
  sse-swap='message'
)
```

instead use `${}` or string contact.

2. plain text

use `.` to indicate that the following lines are plain text instead of html elements.

```pug
p.
  This is a plain text block.
  It will be rendered as HTML without escaping.
```