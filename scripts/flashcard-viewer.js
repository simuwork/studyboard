class FlashcardViewer {
  constructor() {
    this.sets = [];
    this.currentSet = null;
    this.currentCards = [];
    this.currentIndex = 0;
    this.showAnswer = false;
    this.answerLevel = 0;
    this.selectedCategory = 'all';

    this.elements = {
      setSelect: document.getElementById('flashcard-set-select'),
      deleteBtn: document.getElementById('delete-set-btn'),
      exportBtn: document.getElementById('export-btn'),
      categoryFilters: document.getElementById('category-filters'),
      emptyState: document.getElementById('empty-state'),
      flashcardContainer: document.getElementById('flashcard-container'),
      viewer: document.getElementById('flashcard-viewer'),
      category: document.getElementById('card-category'),
      counter: document.getElementById('card-counter'),
      question: document.getElementById('card-question'),
      answerSection: document.getElementById('card-answer-section'),
      answerLevel: document.getElementById('answer-level'),
      answer: document.getElementById('card-answer'),
      hint: document.getElementById('card-hint'),
      progress: document.getElementById('progress'),
      prevBtn: document.getElementById('prev-btn'),
      nextBtn: document.getElementById('next-btn')
    };

    this.init();
  }

  async init() {
    await this.loadSets();
    this.setupEventListeners();
    this.render();
  }

  async loadSets() {
    if (!chrome?.storage?.local) {
      console.error('Chrome storage not available');
      return;
    }

    try {
      const result = await chrome.storage.local.get(['savedFlashcards']);
      this.sets = (result.savedFlashcards || []).reverse(); // Most recent first
    } catch (error) {
      console.error('Error loading flashcard sets:', error);
    }
  }

  setupEventListeners() {
    this.elements.setSelect.addEventListener('change', () => {
      const setId = this.elements.setSelect.value;
      this.selectSet(setId);
    });

    this.elements.deleteBtn.addEventListener('click', () => this.deleteCurrentSet());
    this.elements.exportBtn.addEventListener('click', () => this.exportCurrentSet());

    this.elements.viewer.addEventListener('click', () => this.toggleAnswer());
    this.elements.prevBtn.addEventListener('click', () => this.previousCard());
    this.elements.nextBtn.addEventListener('click', () => this.nextCard());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        this.toggleAnswer();
      } else if (e.key === 'ArrowLeft') {
        this.previousCard();
      } else if (e.key === 'ArrowRight') {
        this.nextCard();
      }
    });
  }

  render() {
    if (this.sets.length === 0) {
      this.elements.emptyState.classList.remove('hidden');
      this.elements.flashcardContainer.classList.add('hidden');
      this.elements.deleteBtn.disabled = true;
      this.elements.exportBtn.disabled = true;
      return;
    }

    this.elements.emptyState.classList.add('hidden');
    this.renderSetSelector();

    if (this.currentSet) {
      this.renderFlashcard();
    }
  }

  renderSetSelector() {
    this.elements.setSelect.innerHTML = '<option value="">-- Select a set --</option>' +
      this.sets.map((set, index) => {
        const date = new Date(set.timestamp);
        const label = `Set ${this.sets.length - index} - ${set.count} cards (${date.toLocaleDateString()} ${date.toLocaleTimeString()})`;
        return `<option value="${set.id}">${label}</option>`;
      }).join('');
  }

  selectSet(setId) {
    this.currentSet = this.sets.find(s => s.id === setId);
    
    if (!this.currentSet) {
      this.elements.flashcardContainer.classList.add('hidden');
      this.elements.deleteBtn.disabled = true;
      this.elements.exportBtn.disabled = true;
      return;
    }

    this.elements.deleteBtn.disabled = false;
    this.elements.exportBtn.disabled = false;
    this.currentIndex = 0;
    this.showAnswer = false;
    this.answerLevel = 0;
    this.selectedCategory = 'all';
    
    this.renderCategoryFilters();
    this.updateCurrentCards();
    this.elements.flashcardContainer.classList.remove('hidden');
    this.renderFlashcard();
  }

  renderCategoryFilters() {
    if (!this.currentSet) return;

    const categories = ['all', ...new Set(this.currentSet.cards.map(c => c.category || 'General'))];
    
    this.elements.categoryFilters.innerHTML = categories.map(cat => 
      `<button class="category-btn ${cat === this.selectedCategory ? 'active' : ''}" data-category="${cat}">
        ${cat === 'all' ? `All (${this.currentSet.cards.length})` : cat}
      </button>`
    ).join('');

    this.elements.categoryFilters.querySelectorAll('.category-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.selectedCategory = btn.dataset.category;
        this.currentIndex = 0;
        this.showAnswer = false;
        this.answerLevel = 0;
        this.updateCurrentCards();
        this.renderCategoryFilters();
        this.renderFlashcard();
      });
    });
  }

  updateCurrentCards() {
    if (!this.currentSet) return;
    
    if (this.selectedCategory === 'all') {
      this.currentCards = this.currentSet.cards;
    } else {
      this.currentCards = this.currentSet.cards.filter(
        c => (c.category || 'General') === this.selectedCategory
      );
    }
  }

  renderFlashcard() {
    if (!this.currentCards.length) {
      this.elements.question.textContent = 'No cards in this category';
      return;
    }

    const card = this.currentCards[this.currentIndex];
    
    this.elements.category.textContent = card.category || 'General';
    this.elements.counter.textContent = `${this.currentIndex + 1} / ${this.currentCards.length}`;
    this.elements.question.textContent = card.q;
    this.elements.progress.textContent = `Card ${this.currentIndex + 1} of ${this.currentCards.length}`;

    if (this.showAnswer) {
      const answers = Array.isArray(card.a) ? card.a : [card.a];
      this.elements.answerSection.classList.add('visible');
      this.elements.answerLevel.textContent = `Answer Level ${this.answerLevel + 1} / ${answers.length}`;
      this.elements.answer.textContent = answers[this.answerLevel] || answers[0];
      this.elements.hint.textContent = this.answerLevel < answers.length - 1
        ? 'Click for more detail or press Space'
        : 'Click to hide answer';
      this.elements.viewer.classList.add('flipped');
    } else {
      this.elements.answerSection.classList.remove('visible');
      this.elements.hint.textContent = 'Click card or press Space to reveal answer';
      this.elements.viewer.classList.remove('flipped');
    }

    this.elements.prevBtn.disabled = this.currentIndex === 0;
    this.elements.nextBtn.disabled = this.currentIndex === this.currentCards.length - 1;
  }

  toggleAnswer() {
    if (!this.currentCards.length) return;

    const card = this.currentCards[this.currentIndex];
    const answers = Array.isArray(card.a) ? card.a : [card.a];

    if (!this.showAnswer) {
      this.showAnswer = true;
      this.answerLevel = 0;
    } else if (this.answerLevel < answers.length - 1) {
      this.answerLevel++;
    } else {
      this.showAnswer = false;
      this.answerLevel = 0;
    }

    this.renderFlashcard();
  }

  previousCard() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.showAnswer = false;
      this.answerLevel = 0;
      this.renderFlashcard();
    }
  }

  nextCard() {
    if (this.currentIndex < this.currentCards.length - 1) {
      this.currentIndex++;
      this.showAnswer = false;
      this.answerLevel = 0;
      this.renderFlashcard();
    }
  }

  async deleteCurrentSet() {
    if (!this.currentSet) return;

    const confirmed = confirm(`Are you sure you want to delete this flashcard set with ${this.currentSet.count} cards? This cannot be undone.`);
    
    if (!confirmed) return;

    try {
      const result = await chrome.storage.local.get(['savedFlashcards']);
      const savedFlashcards = result.savedFlashcards || [];
      
      const updatedSets = savedFlashcards.filter(s => s.id !== this.currentSet.id);
      
      await chrome.storage.local.set({ savedFlashcards: updatedSets });
      
      this.sets = updatedSets.reverse();
      this.currentSet = null;
      this.currentCards = [];
      
      this.render();
    } catch (error) {
      console.error('Error deleting flashcard set:', error);
      alert('Error deleting flashcard set');
    }
  }

  exportCurrentSet() {
    if (!this.currentSet) return;

    const dataStr = JSON.stringify(this.currentSet.cards, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `flashcards-${new Date(this.currentSet.timestamp).toISOString().split('T')[0]}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  }
}

// Initialize the viewer when the page loads
document.addEventListener('DOMContentLoaded', () => {
  new FlashcardViewer();
});
