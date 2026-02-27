// Character form handler
// Serializes form data as JSON with proper nested object structure

document.addEventListener('DOMContentLoaded', function() {
  const form = document.querySelector('.character-form');
  if (!form) return;

  // Store returnTo from URL parameter for later redirect
  const urlParams = new URLSearchParams(window.location.search);
  const returnTo = urlParams.get('returnTo');

  if (returnTo) {
    sessionStorage.setItem('returnAfterCharacter', '/game/' + returnTo);
  }

  form.addEventListener('submit', function(event) {
    event.preventDefault();

    // Collect form data and build proper JSON object
    const formData = new FormData(form);
    const data = {};

    // Build ability scores object from dotted names
    const abilityScores = {};
    const otherData = {};

    formData.forEach((value, key) => {
      const numValue = Number(value);
      const finalValue = !isNaN(numValue) && value !== '' ? numValue : value;

      if (key.startsWith('abilityScores.')) {
        const abilityKey = key.replace('abilityScores.', '');
        abilityScores[abilityKey] = finalValue;
      } else {
        otherData[key] = finalValue;
      }
    });

    // Merge data
    data.abilityScores = abilityScores;
    Object.assign(data, otherData);

    // Send as JSON
    fetch('/api/characters', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    })
      .then(async (response) => {
        if (response.ok) {
          // Smart redirect based on where user came from
          const referrer = document.referrer;
          const storedReturnTo = sessionStorage.getItem('returnAfterCharacter');

          // Clear the stored return URL
          sessionStorage.removeItem('returnAfterCharacter');

          // Determine where to redirect
          if (storedReturnTo) {
            // User came from game page (select character flow)
            window.location.href = storedReturnTo;
          } else if (referrer && (referrer.includes('/lobby') || referrer.includes('/game/'))) {
            // User came from lobby or game page, go back to lobby
            window.location.href = '/lobby';
          } else {
            // Default: go to characters page
            window.location.href = '/characters';
          }
        } else {
          const error = await response.json();
          alert('Error: ' + (error.error?.message || 'Failed to create character'));
        }
      })
      .catch((err) => {
        console.error('Error creating character:', err);
        alert('Error: Failed to create character');
      });
  });
});
