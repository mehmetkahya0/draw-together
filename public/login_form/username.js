document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('usernameForm');
    form.onsubmit = function(e) {
        const username = document.getElementById('username').value.trim();
        
        // Check if the username is empty (additional client-side validation)
        if (!username) {
            e.preventDefault(); // Prevent form submission
            alert('Please enter a username.');
            return false;
        }
        
        // Additional validation can go here (e.g., length, characters, etc.)
        
        // If everything is okay, the form will be submitted
        return true;
    };
});