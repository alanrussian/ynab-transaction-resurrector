'use strict';

(function () {
  const clientId = '60b252599fc55fd7f79c91370e37e141408cf38df7e0fa129130afd960bb683e';
  const currentUrl = `${location.protocol}//${location.host}${location.pathname}`;
  const oauthUrl = `https://app.youneedabudget.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(currentUrl)}&response_type=token`;

  const {
    Button,
    Checkbox,
    CircularProgress,
    Dialog,
    DialogContent,
    DialogContentText,
    DialogTitle,
    LinearProgress,
    MenuItem,
    Select,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
  } = window['material-ui'];
  
  const e = React.createElement;
  
  class App extends React.Component {
    constructor(props) {
      super(props);
      this.state = {};
    }

    render() {
      if (!this.state.budget) {
        return e(
          PromiseRenderer,
          {
            promiseCreator: () => this.props.api.budgets.getBudgets(),
            renderer: response => e(
              BudgetSelector,
              {
                budgets: response.data.budgets,
                onBudgetChange: budgetId => {
                  const budget = response.data.budgets.filter(budget => budget.id == budgetId)[0];
                  this.setState({budget: budget});
                },
              }
            ),
          }
        );r
      }

      const budgetElement = e('h1', {}, this.state.budget.name);
      const transactionsElement = e(
        PromiseRenderer,
        {
          promiseCreator: () => {
            return this.props.api.budgets.getBudgetById(this.state.budget.id, 1);
          },
          renderer: response => e(
            LoadedTransactions,
            {
              api: this.props.api,
              budget: this.state.budget,
              data: response.data.budget,
            },
          ),
        }
      );
      return [budgetElement, transactionsElement];
    }
  }
  
  function BudgetSelector(props) {
    return e(
      Select,
      {
        onChange: event => props.onBudgetChange(event.target.value),
        value: '',
        displayEmpty: true,
      },
      [e(MenuItem, {key: '', value: ''}, 'Select a Budget')].concat(
        props.budgets.map(budget => e(
          MenuItem,
          {key: budget.id, value: budget.id},
          budget.name
        ))
      )
    );
  }

  class LoadedTransactions extends React.Component {
    // TODO: If props.transactions could ever change, override componentDidUpdate.
    constructor(props) {
      super(props);
      
      this.state = {
        checkedTransactionIds: new Set(),
        displayableTransactions: this.createDisplayableTransactions(),
      };
      this.handleCheckedChange = this.handleCheckedChange.bind(this);
      this.handleResurrection = this.handleResurrection.bind(this);
    }

    render() {
      const button = e(
        Button,
        {
          disabled: this.state.checkedTransactionIds.size == 0,
          variant: 'raised',
          color: 'secondary',
          onClick: this.handleResurrection,
        },
        'Resurrect transactions'
      );
      const table = e(
        TransactionTable,
        {
          budget: this.props.budget,
          transactions: this.state.displayableTransactions,
          checkedTransactionIds: this.state.checkedTransactionIds,
          onCheckedChange: this.handleCheckedChange,
        }
      );
      const elements = [button, table];

      if (this.state.savePromise) {
        const saveDialog = e(
          SaveDialog,
          {
            promise: this.state.savePromise,
            onSuccess: () => {
              this.setState(prevState => {
                const updatedTransactions = prevState.displayableTransactions
                    .filter(transaction => !this.state.checkedTransactionIds.has(transaction.id));
                return {
                  checkedTransactionIds: new Set(),
                  displayableTransactions: updatedTransactions,
                  savePromise: null,
                };
              });
            },
            onError: () => {
              this.setState({savePromise: null});
            },
          }
        );
        elements.push(saveDialog);
      }
      return elements;
    }
    
    createDisplayableTransactions() {
      const payeeById = {};
      const payees = this.props.data.payees;
      for (var i = 0; i < payees.length; i++) {
        const payee = payees[i];
        payeeById[payee.id] = payee.name;
      }

      const accountById = {};
      const accounts = this.props.data.accounts;
      for (var i = 0; i < accounts.length; i++) {
        const account = accounts[i];
        accountById[account.id] = account.name;
      }

      const categoryById = {};
      const categories = this.props.data.categories;
      for (var i = 0; i < categories.length; i++) {
        const category = categories[i];
        categoryById[category.id] = category.name;
      }

      const transactions = this.props.data.transactions.filter(transaction => transaction.deleted);
      const result = [];
      for (var i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        var payeeName;
        if (transaction.payee_id) {
          payeeName = payeeById[transaction.payee_id];
        } else if (transaction.transfer_account_id) {
          payeeName = `Transfer: ${accountById[transaction.transfer_account_id]}`;
        } else {
          payeeName = '';
        }
        result.push({
          id: transaction.id,
          accountName: accountById[transaction.account_id],
          date: transaction.date,
          payeeName: payeeName,
          categoryName: categoryById[transaction.category_id],
          memo: transaction.memo,
          amount: transaction.amount,
          isCheckable: !transaction.transfer_account_id,
          original: transaction,
        });
      }
      return result;
    }
    
    handleCheckedChange(transaction, checked) {
      this.setState(prevState => {
        const updatedValue = new Set(prevState.checkedTransactionIds);
        if (checked) {
          updatedValue.add(transaction.id);
        } else {
          updatedValue.delete(transaction.id);
        }
        return {
          checkedTransactionIds: updatedValue
        };
      });
    }
    
    handleResurrection() {
      const transactionsToResurrect = [];
      for (var i = 0; i < this.state.displayableTransactions.length; i++) {
        const transaction = this.state.displayableTransactions[i];
        if (this.state.checkedTransactionIds.has(transaction.id)) {
          transactionsToResurrect.push(transaction.original);
        }
      }
      
      this.setState({
        savePromise: this.resurrect(transactionsToResurrect),
      });
    }
    
    resurrect(transactions) {
      const saveTransactions = transactions.map(transaction => {
        return {
          account_id: transaction.account_id,
          date: transaction.date,
          amount: transaction.amount,
          payee_id: transaction.payee_id,
          category_id: transaction.category_id,
          memo: transaction.memo,
          cleared: transaction.cleared,
          approved: false,
          flag_color: 'red',
          // If set, the transaction wouldn't be re-imported.
          import_id: null,
        };
      });
      return this.props.api.transactions.bulkCreateTransactions(
          this.props.budget.id, {transactions: saveTransactions});
    }
  }

  function TransactionTable(props) {
    const table = e(
      Table,
      {},
      [
        e(
          TableHead,
          {},
          e(
            TableRow,
            {},
            [
              e(TableCell, {}, ''),
              e(TableCell, {}, 'Account'),
              e(TableCell, {}, 'Date'),
              e(TableCell, {}, 'Payee'),
              e(TableCell, {}, 'Category'),
              e(TableCell, {}, 'Memo'),
              e(TableCell, {}, 'Amount'),
            ]
          )
        ),
        e(
          TableBody,
          {},
          props.transactions.map(transaction => 
              e(
                Transaction,
                {
                  key: transaction.id,
                  budget: props.budget,
                  transaction: transaction,
                  checked: props.checkedTransactionIds.has(transaction.id),
                  onCheckedChange: value => props.onCheckedChange(transaction, value)
                }
              )
          )
        ),
      ]
    );
    return [table, e('p', {}, 'Note that Transfer transactions cannot be resurrected')];
  }

  function Transaction(props) {
    const amount = (props.transaction.amount < 0 ? '-' : '') +
        props.budget.currency_format.currency_symbol +
        ynab.utils.convertMilliUnitsToCurrencyAmount(
          Math.abs(props.transaction.amount), 
          props.budget.currency_format.decimal_digits);
    return e(
      TableRow,
      {},
      [
        e(
          TableCell,
          {},
          e(
            Checkbox,
            {
              checked: props.checked,
              disabled: !props.transaction.isCheckable,
              onChange: event => props.onCheckedChange(event.target.checked)
            }
          )
        ),
        e(TableCell, {}, props.transaction.accountName),
        e(TableCell, {}, props.transaction.date),
        e(TableCell, {}, props.transaction.payeeName),
        e(TableCell, {}, props.transaction.categoryName),
        e(TableCell, {}, props.transaction.memo),
        e(TableCell, {}, amount),
      ]
    );
  }

  class PromiseRenderer extends React.Component {
    constructor (props) {
      super(props)
      this.state = {};
      props.promiseCreator().then(value => {
        this.setState({value: value});
      })
      .catch(error => {
        console.log(error);
        this.setState({error: error});
      });
    }

    render () {
      if (this.state.value) {
        return this.props.renderer(this.state.value);
      }
      
      if (this.state.error) {
        return [
          e('h3', {}, 'Error'),
          e('p', {}, JSON.stringify(this.state.error)),
        ];
      }
      
      return e(LinearProgress);
    }
  }

  class SaveDialog extends React.Component {
    constructor (props) {
      super(props)
      this.state = {};
      props.promise.then(value => {
        props.onSuccess();
        this.setState({value: value});
      })
      .catch(error => {
        console.log(error);
        this.setState({error: error});
      });
    }

    render () {
      if (this.state.value || this.state.dismissed) {
        return;
      }
      
      if (this.state.error) {
        return e(
          ErrorDialog,
          {
            error: JSON.stringify(this.state.error),
            onClose: () => {
              this.props.onError();
              this.setState({dismissed: true});
            },
          },
        );
      }

      return e(SavingDialog);
    }
  }

  function SavingDialog(props) {
    return e(
      Dialog,
      {
        open: true,
        disableBackdropClick: true,
        disableEscapeKeyDown: true,
      },
      [e(DialogTitle, {}, 'Saving...'), e(DialogContent, {}, e(LinearProgress))],
    );
  }

  function ErrorDialog(props) {
    return e(
      Dialog,
      {
        open: true,
        onClose: event => {
          props.onClose();
        },
      },
      [e(DialogTitle, {}, 'Error'), e(DialogContent, {}, e(DialogContentText, {}, props.error))],
    );
  }
  
  function main() {
    if (!window.location.hash.startsWith('#access_token=')) {
      window.location = oauthUrl;
      return;
    }
    const accessToken = window.location.hash.substring('#access_token='.length).split('&')[0];

    ReactDOM.render(e(App, {api: new ynab.API(accessToken)}), document.querySelector("#app"));
  }

  main();
})();
